"""Read-only readiness gate. Never merge, dismiss findings or post submissions."""
import argparse
import json
import io
import re
import zipfile
from pathlib import Path
import subprocess
import tempfile

REPO = 'divyanshAgarwal123/soundrig'
TRUSTED_BASE = 'main'
ERROR_LOG_DIR = Path(__file__).resolve().parents[1]/'.qa-output/review-gate-errors'
REQUIRED = {'Offline regression (Linux)', 'Native Godot integration (Linux)'}
CLOSED = {'implemented', 'full_implementation', 'dismissed', 'detected_after_merge', 'outdated'}
OPEN = {'pending', 'partial_implementation', 'not_implemented', 'focus_areas_edited'}


def identity(pr):
    return (pr['headRefOid'], pr.get('baseRefOid'),
            (pr.get('potentialMergeCommit') or {}).get('oid'))


def assess(pr, review, initial_identity):
    head = pr['headRefOid']
    session = review.get('review_session') or {}
    reasons, low = [], []
    owner = REPO.split('/')[0].casefold()
    if (pr.get('author') or {}).get('login','').casefold() != owner or pr.get('isCrossRepository') is not False:
        reasons.append('Only owner-authored same-repository PRs are eligible; other contributions require human review')
    if pr.get('baseRefName') != TRUSTED_BASE:
        reasons.append('An unmerged or non-default base requires human trust review')
    controls = pr.get('controlChanges')
    if controls is None:
        reasons.append('CI control changes were not checked')
    elif controls:
        reasons.append('CI or verification controls changed; human review is required')
    if identity(pr) != initial_identity:
        reasons.append('PR head, base or merge candidate changed during collection')
    if not all(identity(pr)) or pr.get('testedMergeCommit') != identity(pr)[2]:
        reasons.append('CI receipt does not cover the current merge candidate')
    if session.get('status') != 'completed' or session.get('review_complete') is not True:
        reasons.append('Qodo review is missing, incomplete or not completed')
    if session.get('commit_sha') != head:
        reasons.append('Qodo review does not cover the current PR head')
    if review.get('qar_operation_result_truncated') or review.get('truncated') or review.get('next_page_token'):
        reasons.append('Qodo findings are incomplete')
    findings = review.get('findings')
    if not isinstance(findings, list) or review.get('finding_count') != len(findings):
        reasons.append('Qodo finding count/shape is incomplete')
        findings = []
    for finding in findings:
        state, level = finding.get('attribution_status'), finding.get('action_level')
        if state == 'dismissed' and (
                finding.get('dismiss_reason') not in {'false_positive', 'intentional', 'deferred', 'rejected'}
                or not isinstance(finding.get('dismiss_explanation'), str)
                or not finding['dismiss_explanation'].strip()):
            reasons.append('Dismissed finding lacks a documented reason: '+str(finding.get('title')))
        if state == 'dismissed' and finding.get('dismiss_reason') in {'deferred', 'rejected'}:
            if level == 'informational':
                low.append({'id':finding['id'], 'title':finding['title']})
            else:
                reasons.append('Actionable finding was deferred or rejected, not fixed: '+str(finding.get('title')))
            continue
        if state in CLOSED:
            continue
        if state not in OPEN:
            reasons.append('Unknown finding state: '+str(state))
        elif level == 'informational':
            low.append({'id': finding['id'], 'title': finding['title']})
        else:
            # Block actionable and unknown levels; never infer that unknown means Low.
            reasons.append('Open actionable finding: '+str(finding.get('title')))
    checks = pr.get('statusCheckRollup', [])
    for name in sorted(REQUIRED):
        matching = [c for c in checks if c.get('name') == name]
        if not matching or any(str(c.get('status')).upper() != 'COMPLETED' or str(c.get('conclusion')).upper() != 'SUCCESS' or c.get('head_sha') != head for c in matching):
            reasons.append('Required CI is not successful: '+name)
    # The structured Qodo API attests a head, but exposes no reviewed base/merge.
    # Comparing the base only during collection misses an earlier base update.
    # Keep useful head/CI evidence separate and fail closed for human base review.
    head_and_ci_pass = not reasons
    reasons.append('Qodo does not attest the reviewed base or merge; human base review is required')
    return {'pass': False, 'headAndCIEvidencePass': head_and_ci_pass,
            'reviewedBaseAttested': False, 'head': head, 'base':pr.get('baseRefOid'),
            'testedMergeCommit':pr.get('testedMergeCommit'), 'ciRun':pr.get('ciRun'), 'reviewSession': session,
            'blockers': reasons, 'lowFindingsForHuman': low,
            'humanMergeRequired': True, 'controlsNeedingHumanReview':controls or []}


def run_checked(command, binary=False):
    result = subprocess.run(command, capture_output=True, text=not binary, timeout=90)
    if result.returncode:
        detail = result.stderr or result.stdout
        if isinstance(detail,bytes):
            detail = detail.decode('utf-8','replace')
        lowered = detail.casefold()
        kind = ('rate limit' if 'rate limit' in lowered else 'authentication/authorization'
                if any(x in lowered for x in ('credential','authenticate','login','log in','401','403')) else 'command error')
        ERROR_LOG_DIR.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w',dir=ERROR_LOG_DIR,prefix='read-',suffix='.txt',delete=False) as log:
            log.write(detail[:16384])
            location = log.name
        raise RuntimeError(f'{Path(command[0]).name} exited {result.returncode} ({kind}); private diagnostics: {location}')
    return result.stdout


def read(command):
    return json.loads(run_checked(command))


def read_pages(endpoint, key):
    pages = read(['gh','api','--paginate','--slurp',endpoint])
    items = [item for page in pages for item in page[key]]
    if not pages or any(page['total_count'] != len(items) for page in pages):
        raise ValueError('Paginated CI results changed or are incomplete')
    return items


def is_control(path):
    return (path.startswith(('.github/workflows/','ci/','fixtures/','evidence/','integration-proof/'))
            or path in {'run_checks.py','verify-godot.py'}
            or Path(path).name.startswith(('test-','test_')))


def collect_changes(pr, number):
    pages = read(['gh','api','--paginate','--slurp',f'repos/{REPO}/pulls/{number}/files?per_page=100'])
    files = [item for page in pages for item in page]
    if len(files) != pr['changedFiles']:
        raise ValueError('PR changed-file list is incomplete or changed during collection')
    paths = {p for item in files for p in (item['filename'],item.get('previous_filename')) if p}
    pr['controlChanges'] = sorted(p for p in paths if is_control(p))


def collect_ci(pr):
    checks = read_pages(f'repos/{REPO}/commits/{pr["headRefOid"]}/check-runs?filter=latest&per_page=100', 'check_runs')
    pr['statusCheckRollup'] = checks
    selected = [c for c in checks if c['name'] in REQUIRED]
    if {c['name'] for c in selected} != REQUIRED:
        raise ValueError('Required CI checks are missing')
    runs = set()
    for check in selected:
        match = re.fullmatch(r'https://github\.com/'+re.escape(REPO)+r'/actions/runs/(\d+)/job/\d+',check.get('details_url') or '')
        if not match or (check.get('app') or {}).get('slug') != 'github-actions':
            raise ValueError('Unexpected CI provider or run URL')
        runs.add(match[1])
    if len(runs) != 1:
        raise ValueError('Required jobs do not belong to one workflow run')
    run_id = runs.pop()
    artifacts = read_pages(f'repos/{REPO}/actions/runs/{run_id}/artifacts?per_page=100', 'artifacts')
    merge = identity(pr)[2]
    available = {a['name']:a for a in artifacts if not a['expired']}
    if not merge or not all(prefix+merge in available for prefix in ('offline-','native-')):
        raise ValueError('CI artifacts belong to another merge candidate or are unavailable')
    native = available['native-'+merge]
    if not 0 < native.get('size_in_bytes',1_000_001) <= 1_000_000:
        raise ValueError('Native CI archive is oversized')
    artifact_id = native['id']
    data = run_checked(['gh','api',f'repos/{REPO}/actions/artifacts/{artifact_id}/zip'], binary=True)
    if len(data) > 1_000_000:
        raise ValueError('Native CI receipt archive is unavailable or oversized')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        info = archive.getinfo('receipt.json')
        if info.file_size > 65536:
            raise ValueError('Native CI receipt is oversized')
        receipt = json.loads(archive.read(info))
    if receipt.get('pass') is not True or receipt.get('sourceCommit') != merge:
        raise ValueError('Native CI receipt is failing or source-mismatched')
    pr['testedMergeCommit'] = receipt['sourceCommit']
    pr['ciRun'] = f'https://github.com/{REPO}/actions/runs/{run_id}'


def check_fingerprint(checks):
    return sorted((c.get('name'), str(c.get('status')).upper(),
                   str(c.get('conclusion')).upper(),
                   c.get('details_url') or c.get('detailsUrl') or '')
                  for c in checks if c.get('name') in REQUIRED)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pr', type=int, required=True)
    args = parser.parse_args()
    if args.pr < 1:
        parser.error('--pr must be positive')
    report = {'pass': False, 'headAndCIEvidencePass': False, 'reviewedBaseAttested': False, 'blockers': ['Collection has not completed'], 'humanMergeRequired': True}
    try:
        command = ['gh', 'pr', 'view', str(args.pr), '--repo', REPO,
                   '--json', 'headRefOid,baseRefOid,baseRefName,potentialMergeCommit,statusCheckRollup,author,isCrossRepository,changedFiles,url']
        pr = read(command)
        if pr['url'] != f'https://github.com/{REPO}/pull/{args.pr}':
            raise ValueError('Unexpected repository or PR URL')
        with tempfile.TemporaryDirectory(prefix='soundrig-review-gate-') as temp:
            params = Path(temp)/'args.json'
            params.write_text(json.dumps({'pr_url':pr['url'], 'extended':True}))
            review = read([str(Path.home()/'.qodo/bin/qodo'), 'read', 'pr-review-session', 'findings',
                           '--args-file', str(params), '--json'])
        latest = read(command)
        collect_changes(latest,args.pr)
        collect_ci(latest)
        final = read(command)
        verified = latest['statusCheckRollup']
        heads = {(c.get('name'), c.get('details_url') or c.get('detailsUrl') or ''):c.get('head_sha') for c in verified}
        observed = final.get('statusCheckRollup', [])
        final['statusCheckRollup'] = [dict(c, head_sha=heads.get((c.get('name'),c.get('details_url') or c.get('detailsUrl') or ''))) for c in observed]
        final['testedMergeCommit'] = latest.get('testedMergeCommit')
        final['ciRun'] = latest.get('ciRun')
        final['controlChanges'] = latest.get('controlChanges')
        report = assess(final, review, identity(pr))
        if check_fingerprint(verified) != check_fingerprint(observed):
            report['blockers'].append('Required CI changed while collecting receipts')
            report['pass'] = False
            report['headAndCIEvidencePass'] = False
        if identity(latest) != identity(final):
            report['blockers'].append('PR identity changed while collecting CI')
            report['pass'] = False
            report['headAndCIEvidencePass'] = False
        report['pr'] = pr['url']
    except Exception as error:
        report['blockers'] = [f'{type(error).__name__}: {error}']
    print(json.dumps(report, indent=2))
    return 0 if report['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())

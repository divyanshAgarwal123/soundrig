"""Always record native verification, including interrupted or failed commands."""
from pathlib import Path
import argparse
import json
import os


def record(folder, job_status):
    report = {'pass': False, 'status': 'failed', 'newModelCalls': 0,
              'sourceCommit': os.environ.get('GITHUB_SHA'),
              'scope': 'Official native Godot with Dummy audio. No physical listening or outside user test.'}
    try:
        if job_status != 'success':
            raise RuntimeError('Native job did not succeed: '+job_status)
        kit = json.loads((folder/'kit.json').read_text())
        game = json.loads(next(line for line in (folder/'game.log').read_text().splitlines() if line.startswith('{')))
        if not kit['pass'] or len(kit['cases']) != 7 or not game['pass']:
            raise ValueError('Native kit or game result failed')
        for name in ('kit.log', 'import.log', 'game.log'):
            if 'ERROR:' in (folder/name).read_text():
                raise ValueError('Engine error in '+name)
        report.update({'pass': True, 'status': 'passed', 'kitCases':len(kit['cases']), 'game':game})
    except Exception as error:
        report['error'] = f'{type(error).__name__}: {error}'
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'receipt.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job-status', default='success')
    args = parser.parse_args()
    report = record(Path(__file__).resolve().parents[1]/'.qa-output/native', args.job_status)
    print(json.dumps(report))
    raise SystemExit(0 if report['pass'] else 1)

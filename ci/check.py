"""Run SoundRig's offline suite in an isolated copy, with our own server."""
from pathlib import Path
import argparse
import hashlib
import fcntl
import json
import os
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
# Readiness is written only after this child binds. Never probe somebody else's server.
SERVER = """
import os,sys
from pathlib import Path
import server
server.MODEL_ENABLED=False
def offline_request(*args, **kwargs):
    raise ConnectionError('Inference is disabled in this CI process.')
server.model_request=offline_request
class OfflineHandler(server.Handler):
    def do_POST(self):
        if self.path == '/api/model-mode':
            self.close_connection=True
            self.reply(403, {'error':'Inference mode is locked off in CI.'})
            return
        super().do_POST()
httpd=server.ThreadingHTTPServer(('127.0.0.1',8772),OfflineHandler)
Path(sys.argv[1]).write_text(str(os.getpid()))
httpd.serve_forever()
"""


EXCLUDED = shutil.ignore_patterns(
    '.git', '.soundrig-revisions', '.qodo', '.agents', '.qa-output',
    '__pycache__', '.godot', '.env', '.env.*', '*.sqlite3*')


def private_or_links(folder, names):
    # Never dereference a link into private or outside files during either copy.
    return set(EXCLUDED(folder, names)) | {
        name for name in names if (Path(folder)/name).is_symlink()}


def stop(process):
    """Each child owns its process group; include grandchildren on timeout."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    # The leader may exit while a descendant ignores SIGTERM.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    finally:
        process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'.qa-output/latest')
    parser.add_argument('--timeout', type=int, default=1200)
    args = parser.parse_args()
    output = args.output.resolve()
    if args.timeout < 1:
        parser.error('--timeout must be positive')
    if output.is_relative_to(ROOT) and not output.is_relative_to(ROOT/'.qa-output'):
        parser.error('in-repository output must be under .qa-output/')
    output.mkdir(parents=True, exist_ok=True)
    run_name = 'runs/'+uuid.uuid4().hex
    artifacts = output/run_name
    artifacts.mkdir(parents=True)
    report = {'pass': False, 'newModelCalls': None,
              'status': 'running', 'artifacts': run_name,
              'scope': 'Fresh isolated source copy, owned offline loopback server and full regression suite. Historical model/browser fixtures are replayed, not regenerated.'}
    def receipt(initial=False):
        text = json.dumps(report, indent=2)+'\n'
        (artifacts/'receipt.json').write_text(text)
        with (output/'.receipt.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            latest = output/'receipt.json'
            if initial or json.loads(latest.read_text())['artifacts'] == run_name:
                pending = output/('receipt-'+uuid.uuid4().hex+'.tmp')
                pending.write_text(text)
                pending.replace(latest)
    receipt(initial=True)
    previous_term = signal.getsignal(signal.SIGTERM)
    def terminated(signum, frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise InterruptedError('Runner terminated; owned children are being stopped')
    signal.signal(signal.SIGTERM, terminated)
    began = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='soundrig-ci-') as temp:
            workspace = Path(temp)/'studio'
            shutil.copytree(ROOT, workspace, ignore=private_or_links)
            # An interrupted run must never expose the baseline's PASS as a fresh result.
            (workspace/'evidence/final-checks.json').unlink(missing_ok=True)
            source_hash = hashlib.sha256()
            for path in sorted(workspace.rglob('*')):
                if path.is_file():
                    source_hash.update(path.relative_to(workspace).as_posix().encode()+b'\0')
                    source_hash.update(hashlib.sha256(path.read_bytes()).digest())
            report['sourceSHA256'] = source_hash.hexdigest()
            report['node'] = subprocess.check_output(['node', '--version'], text=True, timeout=5).strip()
            try:
                report['sourceCommit'] = subprocess.check_output(
                    ['git', 'rev-parse', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL, text=True, timeout=5).strip()
            except subprocess.CalledProcessError:
                report['sourceCommit'] = None
            ready = Path(temp)/'server-ready'
            with (artifacts/'server.log').open('w') as log:
                child = subprocess.Popen([sys.executable, '-u', '-c', SERVER, str(ready)],
                                         cwd=workspace, stdout=log, stderr=log, start_new_session=True)
                try:
                    deadline = time.monotonic()+15
                    while not ready.exists():
                        if child.poll() is not None:
                            raise RuntimeError('Owned server failed to bind/start; see server.log. An existing server was not used or stopped.')
                        if time.monotonic() > deadline:
                            raise TimeoutError('Owned server readiness timed out')
                        time.sleep(.05)
                    if ready.read_text() != str(child.pid) or child.poll() is not None:
                        raise RuntimeError('Owned server readiness identity mismatch')
                    with urllib.request.urlopen('http://127.0.0.1:8772/api/status', timeout=5) as response:
                        before = json.load(response)
                    if before['enabled'] or before['calls']['upstream']:
                        raise RuntimeError('Isolated server must start with inference disabled and zero calls')
                    with (artifacts/'checks.log').open('w') as checks_log:
                        suite = subprocess.Popen([sys.executable, 'run_checks.py'], cwd=workspace,
                                                 stdout=checks_log, stderr=subprocess.STDOUT,
                                                 start_new_session=True)
                        try:
                            code = suite.wait(timeout=args.timeout)
                        finally:
                            stop(suite)
                    with urllib.request.urlopen('http://127.0.0.1:8772/api/status', timeout=5) as response:
                        after = json.load(response)
                    # Always preserve the suite's own receipt and diagnostics, even on failure.
                    shutil.copytree(workspace/'evidence', artifacts/'evidence', dirs_exist_ok=True, ignore=private_or_links)
                    report['returncode'] = code
                    report['newModelCalls'] = after['calls']['upstream']
                    report['pass'] = code == 0 and after['calls']['upstream'] == 0
                finally:
                    stop(child)
                    # A timeout can occur before the normal receipt copy.
                    shutil.copytree(workspace/'evidence', artifacts/'evidence', dirs_exist_ok=True, ignore=private_or_links)
    except Exception as error:
        report.update(error=f'{type(error).__name__}: {error}')
        report['pass'] = False
    finally:
        report['seconds'] = round(time.monotonic()-began, 3)
        report['python'] = sys.version.split()[0]
        report['status'] = 'passed' if report['pass'] else 'failed'
        receipt()
        signal.signal(signal.SIGTERM, previous_term)
        print(json.dumps(report), flush=True)
    return 0 if report['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())

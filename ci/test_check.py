"""Exercise real child/server ownership and failure receipts using a tiny fixture."""
from pathlib import Path
import contextlib
import importlib.util
import io
import json
import runpy
import socket
import sys
import tempfile
import subprocess
import os
import signal
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('soundrig_ci', Path(__file__).with_name('check.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
SERVER = '''from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
import json
def model_request(*args):
 raise AssertionError('Original model transport must never run')
class Handler(BaseHTTPRequestHandler):
 def reply(self,status,value):
  self.send_response(status);self.end_headers();self.wfile.write(json.dumps(value).encode())
 def do_POST(self):
  global MODEL_ENABLED
  MODEL_ENABLED=True
  self.reply(200,{'enabled':True})
 def do_GET(self):
  if self.path == '/probe-model':
   try:model_request('test','test')
   except ConnectionError:self.reply(200,{'blocked':True});return

  self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'enabled':MODEL_ENABLED,'calls':{'upstream':0}}).encode())
'''


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'source'
        self.root.mkdir()
        self.output = Path(self.temp.name)/'result'
        (self.root/'server.py').write_text(SERVER)
        (self.root/'evidence').mkdir()
        (self.root/'evidence/final-checks.json').write_text('{"pass":true,"historical":true}')
        (self.root/'.soundrig-revisions').mkdir()
        (self.root/'.soundrig-revisions/private').write_text('synthetic private-store sentinel')
        (self.root/'.env').write_text('synthetic environment sentinel')
        (self.root/'skills-lock.json').write_text('{"privateAgentMetadata":true}')

    def run_fixture(self, code, timeout=5):
        (self.root/'run_checks.py').write_text(code)
        with patch.object(runner, 'ROOT', self.root), patch.object(sys, 'argv', [
                'check.py', '--output', str(self.output), '--timeout', str(timeout)]), contextlib.redirect_stdout(io.StringIO()):
            result = runner.main()
        report = json.loads((self.output/'receipt.json').read_text())
        self.artifacts = self.output/report['artifacts']
        return result, report

    def assert_port_released(self):
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', 8772))

    def test_success_is_isolated_and_preserves_original_receipt(self):
        result, report = self.run_fixture('''from pathlib import Path
assert not Path('.soundrig-revisions').exists()
assert not Path('.env').exists()
assert not Path('skills-lock.json').exists()
assert not Path('evidence/final-checks.json').exists()
Path('evidence/final-checks.json').write_text('{"pass":true,"fresh":true}')
''')
        self.assertEqual(result, 0)
        self.assertTrue(report['pass'])
        self.assertTrue(json.loads((self.artifacts/'evidence/final-checks.json').read_text())['fresh'])
        self.assertTrue(json.loads((self.root/'evidence/final-checks.json').read_text())['historical'])
        self.assertTrue((self.root/'.soundrig-revisions/private').exists())
        self.assert_port_released()

    def test_suite_failure_is_failing_with_diagnostics(self):
        result, report = self.run_fixture("print('deliberate suite failure',flush=True)\nraise SystemExit(7)")
        self.assertEqual(result, 1)
        self.assertFalse(report['pass'])
        self.assertEqual(report['returncode'], 7)
        self.assertIn('deliberate suite failure', (self.artifacts/'checks.log').read_text())
        self.assertFalse((self.artifacts/'evidence/final-checks.json').exists())
        self.assert_port_released()

    def test_occupied_port_keeps_existing_listener(self):
        with socket.socket() as owner:
            owner.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            owner.bind(('127.0.0.1', 8772))
            owner.listen()
            result, report = self.run_fixture("raise AssertionError('must not run')")
            self.assertEqual(result, 1)
            self.assertIn('failed to bind/start', report['error'])
            self.assertFalse((self.artifacts/'checks.log').exists())
            self.assertEqual(owner.getsockname()[1], 8772)
            with socket.create_connection(owner.getsockname(), timeout=1):
                connection, _ = owner.accept()
                connection.close()

    def test_timeout_stops_owned_server_and_records_failure(self):
        result, report = self.run_fixture("import time\nprint('started timeout fixture',flush=True)\ntime.sleep(60)", timeout=1)
        self.assertEqual(result, 1)
        self.assertFalse(report['pass'])
        self.assertIn('TimeoutExpired', report['error'])
        self.assertFalse((self.artifacts/'evidence/final-checks.json').exists())
        self.assertIn('started timeout fixture', (self.artifacts/'checks.log').read_text())
        self.assert_port_released()

    def test_failed_rerun_cannot_reuse_a_previous_pass(self):
        result, first = self.run_fixture("from pathlib import Path\nPath('evidence/final-checks.json').write_text('{\"pass\":true,\"fresh\":true}')")
        self.assertEqual(result, 0)
        with socket.socket() as owner:
            owner.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            owner.bind(('127.0.0.1', 8772))
            owner.listen()
            result, second = self.run_fixture("raise AssertionError('must not run')")
        self.assertEqual(result, 1)
        self.assertFalse(second['pass'])
        self.assertNotEqual(first['artifacts'], second['artifacts'])
        self.assertFalse((self.artifacts/'evidence/final-checks.json').exists())
        self.assertFalse((self.artifacts/'checks.log').exists())
        self.assertTrue((self.output/first['artifacts']/'evidence/final-checks.json').exists())

    def start_fixture(self, code):
        (self.root/'run_checks.py').write_text(code)
        script = ("import importlib.util,sys;from pathlib import Path;"
            +"s=importlib.util.spec_from_file_location('runner',"+repr(str(Path(runner.__file__)))+");"
            +"r=importlib.util.module_from_spec(s);s.loader.exec_module(r);r.ROOT=Path("+repr(str(self.root))+");"
            +"sys.argv=['check.py','--output',"+repr(str(self.output))+",'--timeout','20'];sys.exit(r.main())")
        process = subprocess.Popen([sys.executable,'-c',script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        self.addCleanup(lambda: runner.stop(process) if process.poll() is None else None)
        return process

    def wait_file(self, path):
        deadline = time.monotonic()+5
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(.02)
        self.assertTrue(path.exists(), str(path))

    def test_symlinks_never_copy_private_source_or_generated_artifacts(self):
        (self.root/'evidence/source-link').symlink_to(self.root/'.env')
        outside = Path(self.temp.name)/'outside-secret'
        outside.write_text('synthetic outside canary')
        result, report = self.run_fixture("from pathlib import Path\nassert not Path('evidence/source-link').exists()\nPath('evidence/generated-link').symlink_to("+repr(str(outside))+")")
        self.assertEqual(result, 0)
        self.assertFalse((self.artifacts/'evidence/source-link').exists())
        self.assertFalse((self.artifacts/'evidence/generated-link').exists())
        self.assertEqual(outside.read_text(), 'synthetic outside canary')

    def test_sigterm_stops_children_and_publishes_failure(self):
        started = Path(self.temp.name)/'started'
        process = self.start_fixture("from pathlib import Path\nimport time\nPath("+repr(str(started))+").write_text('yes')\ntime.sleep(60)")
        self.wait_file(started)
        process.terminate()
        self.assertEqual(process.wait(timeout=10), 1)
        report = json.loads((self.output/'receipt.json').read_text())
        self.assertFalse(report['pass'])
        self.assertEqual(report['status'], 'failed')
        self.assertIn('InterruptedError', report['error'])
        self.assert_port_released()

    def test_older_completion_cannot_overwrite_a_newer_failure(self):
        started = Path(self.temp.name)/'started'
        process = self.start_fixture("from pathlib import Path\nimport time\nPath("+repr(str(started))+").write_text('yes')\ntime.sleep(2)")
        self.wait_file(started)
        older = json.loads((self.output/'receipt.json').read_text())
        result, newer = self.run_fixture("raise AssertionError('must not run: port owned')")
        self.assertEqual(result, 1)
        self.assertEqual(process.wait(timeout=10), 0)
        latest = json.loads((self.output/'receipt.json').read_text())
        self.assertEqual(latest['artifacts'], newer['artifacts'])
        self.assertFalse(latest['pass'])
        self.assertTrue(json.loads((self.output/older['artifacts']/'receipt.json').read_text())['pass'])

    def test_inference_cannot_be_enabled_or_reach_the_transport(self):
        result, report = self.run_fixture("""import json,urllib.request,urllib.error
req=urllib.request.Request('http://127.0.0.1:8772/api/model-mode',data=b'{"enabled":true}',headers={'Content-Type':'application/json'})
try:urllib.request.urlopen(req);raise AssertionError('mode changed')
except urllib.error.HTTPError as e:assert e.code==403
assert json.load(urllib.request.urlopen('http://127.0.0.1:8772/probe-model'))['blocked']
assert not json.load(urllib.request.urlopen('http://127.0.0.1:8772/api/status'))['enabled']
""")
        self.assertEqual(result, 0)
        self.assertEqual(report['newModelCalls'], 0)

    def test_termination_during_initial_publication_records_failure(self):
        original = Path.replace
        sent = False
        def interrupt(path, target):
            nonlocal sent
            if Path(target).resolve() == (self.output/'receipt.json').resolve() and not sent:
                sent = True
                os.kill(os.getpid(), signal.SIGTERM)
            return original(path, target)
        with patch.object(Path, 'replace', interrupt):
            result, report = self.run_fixture("raise AssertionError('must not reach suite')")
        self.assertTrue(sent)
        self.assertEqual(result, 1)
        self.assertEqual(report['status'], 'failed')
        self.assertIn('InterruptedError', report['error'])

    def test_final_publication_is_not_interrupted_by_sigterm(self):
        original = Path.replace
        writes = 0
        def interrupt(path, target):
            nonlocal writes
            if Path(target).resolve() == (self.output/'receipt.json').resolve():
                writes += 1
                if writes == 2:
                    os.kill(os.getpid(), signal.SIGTERM)
            return original(path, target)
        with patch.object(Path, 'replace', interrupt):
            result, report = self.run_fixture("print('completed suite')")
        self.assertEqual(writes, 2)
        self.assertEqual(result, 0)
        self.assertEqual(report['status'], 'passed')
        self.assert_port_released()

    def test_cleanup_kills_a_resistant_grandchild_after_leader_exits(self):
        pid_file = Path(self.temp.name)/'grandchild'
        grandchild = "import signal,time,os;from pathlib import Path;signal.signal(signal.SIGTERM,signal.SIG_IGN);Path("+repr(str(pid_file))+").write_text(str(os.getpid()));time.sleep(60)"
        parent = subprocess.Popen([sys.executable, '-c',
            "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',"+repr(grandchild)+"]);time.sleep(60)"], start_new_session=True)
        try:
            deadline = time.monotonic()+5
            while not pid_file.exists() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(pid_file.exists())
            pid = int(pid_file.read_text())
            runner.stop(parent)
            # A killed orphan can briefly remain a zombie before init reaps it.
            for _ in range(50):
                state = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], text=True, capture_output=True).stdout.strip()
                if not state or state.startswith('Z'):
                    break
                time.sleep(.02)
            self.assertTrue(not state or state.startswith('Z'), state)
        finally:
            try:
                os.killpg(parent.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            parent.wait(timeout=5)


class SuiteTimeoutTest(unittest.TestCase):
    def test_suite_timeout_writes_a_failing_aggregate_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder/'evidence').mkdir()
            source = Path(__file__).resolve().parents[1]/'run_checks.py'
            shutil_source = folder/'run_checks.py'
            shutil_source.write_text(source.read_text())
            output = io.StringIO()
            with patch('subprocess.run', side_effect=subprocess.TimeoutExpired(
                    ['node', 'test-core.mjs'], 90, output=b'partial stdout', stderr=b'partial stderr')), contextlib.redirect_stdout(output):
                with self.assertRaises(SystemExit) as result:
                    runpy.run_path(str(shutil_source), run_name='__main__')
            self.assertEqual(result.exception.code, 1)
            receipt = json.loads((folder/'evidence/final-checks.json').read_text())
            self.assertFalse(receipt['pass'])
            self.assertTrue(receipt['checks'][0]['timedOut'])
            self.assertIn('partial stdout', output.getvalue())
            self.assertIn('partial stderr', output.getvalue())


if __name__ == '__main__':
    unittest.main()

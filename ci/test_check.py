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
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
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

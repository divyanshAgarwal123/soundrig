"""Failure-path tests use explicit synthetic model/checker fixtures; no inference."""
from pathlib import Path
import importlib.util, json, subprocess, tempfile, unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('soundrig_server',ROOT/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
RIG=json.loads((ROOT/'hybrid-rig.json').read_text())

class AuthoringTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'evidence').mkdir()
        for name in ['core.mjs','checks.mjs','check-authoring.mjs','project-runtime.mjs','bundle.mjs','quality-contract.mjs','studio-dsp.mjs']:(self.root/name).write_text('synthetic checker fingerprint fixture')
        self.root_patch=patch.object(server,'ROOT',self.root);self.root_patch.start()
        self.fixture=(RIG,{'model':'synthetic-test-fixture'})
    def tearDown(self):self.root_patch.stop();self.temp.cleanup()
    def checked(self):return server.checked_generation('system','request',{'prompt':'fixture'},'compile')
    def success(self):return subprocess.CompletedProcess([],0,json.dumps({'ok':True,'checks':[],'rig':RIG}).encode(),b'')
    def test_timeout_retains_output_and_does_not_retry_model(self):
        with patch.object(server,'model_request',return_value=self.fixture) as model,patch.object(server.subprocess,'run',side_effect=subprocess.TimeoutExpired('node',15)):
            result,info=self.checked()
        self.assertFalse(info['verified']);self.assertTrue(info['infrastructureError']);self.assertEqual(model.call_count,1)
        saved=json.loads(next((self.root/'evidence').glob('*.json')).read_text());self.assertEqual(saved['output'],RIG);self.assertEqual(saved['stage'],'verification failed')
        with patch.object(server,'model_request',return_value=self.fixture),patch.object(server.subprocess,'run',return_value=self.success()):self.assertTrue(self.checked()[1]['verified'])
    def test_nonzero_and_malformed_checker_output_do_not_retry_model(self):
        for output in [subprocess.CompletedProcess([],1,b'',b'error'),subprocess.CompletedProcess([],0,b'not-json',b'')]:
            with patch.object(server,'model_request',return_value=self.fixture) as model,patch.object(server.subprocess,'run',return_value=output):
                info=self.checked()[1];self.assertTrue(info['infrastructureError']);self.assertEqual(model.call_count,1)
    def test_semantic_failure_has_one_repair_and_records_both_outputs(self):
        bad=subprocess.CompletedProcess([],0,json.dumps({'ok':False,'error':'No footsteps in the air'}).encode(),b'')
        with patch.object(server,'model_request',return_value=self.fixture) as model,patch.object(server.subprocess,'run',side_effect=[bad,self.success()]):
            info=self.checked()[1];self.assertTrue(info['verified']);self.assertEqual(len(info['attempts']),2)
            self.assertIn('DETERMINISTIC CHECK FAILED',model.call_args_list[1].args[1])
        self.assertEqual(len(list((self.root/'evidence').glob('*.json'))),2)
    def test_unsupported_result_does_not_invoke_checker(self):
        with patch.object(server,'model_request',return_value=({'unsupported':'speech unavailable'},{'model':'synthetic-test-fixture'})),patch.object(server.subprocess,'run') as check:
            result,info=self.checked();self.assertIn('unsupported',result);self.assertFalse(info['verified']);check.assert_not_called()
    def test_upstream_failure_is_recorded_and_admission_recovers(self):
        with patch.object(server,'model_request',side_effect=ConnectionError('fixture unavailable')):
            with self.assertRaises(ConnectionError):self.checked()
        saved=json.loads(next((self.root/'evidence').glob('*.json')).read_text());self.assertEqual(saved['stage'],'model failed')
        self.assertTrue(server.REQUEST_SLOT.acquire(blocking=False));server.REQUEST_SLOT.release()

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(AuthoringTests)
    outcome=unittest.TextTestRunner(verbosity=1).run(suite)
    evidence={'pass':outcome.wasSuccessful(),'cases':outcome.testsRun,'scope':'Synthetic model/checker failure fixtures; no live Meta calls or quality claims.'}
    (ROOT/'evidence/authoring-recovery-test.json').write_text(json.dumps(evidence,indent=2))
    raise SystemExit(0 if outcome.wasSuccessful() else 1)

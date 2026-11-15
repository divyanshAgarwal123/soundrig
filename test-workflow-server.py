"""Actual local validators and explicit synthetic model fixtures. No inference."""
from pathlib import Path
import base64,io,json,struct,subprocess,tempfile,time,unittest,wave,zipfile
from unittest.mock import patch
import server,project_api
from project_assets import prepare_project
ROOT=Path(__file__).resolve().parent
RIG=json.loads((ROOT/'hybrid-rig.json').read_text())
CONTRACT=json.loads((ROOT/'fixtures/workflow-contract.json').read_text())
PATCH={'layerId':'pickup_chime','changes':{'gain':.3,'rate':.95}}

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'evidence').mkdir()
        for f in ROOT.iterdir():
            if f.is_file() and f.suffix in ('.mjs','.json'):(self.root/f.name).symlink_to(f)
        self.root_patch=patch.object(server,'ROOT',self.root);self.root_patch.start()
    def tearDown(self):self.root_patch.stop();self.temp.cleanup()
    def request(self,contract=CONTRACT):return {'prompt':'Explicit synthetic test fixture','rig':RIG,'layerId':'pickup_chime','lockedIds':[l['id'] for l in RIG['layers'] if l['id']!='pickup_chime'],'contract':contract}
    def call(self,request):return server.checked_generation('schema','edit',request,'patch')
    def test_actual_contract_validation_accepts_candidate_and_retains_locks(self):
        with patch.object(server,'model_request',return_value=(PATCH,{'model':'synthetic-fixture'})) as model:
            _,info=self.call(self.request())
        self.assertTrue(info['verified']);self.assertTrue(info['contract']['pass']);self.assertEqual(model.call_count,1)
        self.assertEqual(len(info['contract']['cases']),3)
        self.assertEqual(len(info['contract']['componentSHA256']),64);self.assertEqual(len(info['contract']['projectSnapshotSHA256']),64)
        self.assertTrue(all(len(c['pcmSHA256'])==64 for c in info['contract']['cases']))
    def test_invalid_contract_refuses_before_model(self):
        with patch.object(server,'model_request') as model:
            with self.assertRaises(ValueError):self.call(self.request({'version':2}))
            model.assert_not_called()
    def test_null_model_patch_is_semantic_and_can_use_one_repair(self):
        with patch.object(server,'model_request',side_effect=[(None,{'model':'synthetic-fixture'}),(PATCH,{'model':'synthetic-fixture'})]) as model:
            _,info=self.call(self.request())
        self.assertTrue(info['verified']);self.assertEqual(model.call_count,2);self.assertFalse(info['attempts'][0]['verification'].get('infrastructureError',False));self.assertIn('patch object',info['attempts'][0]['verification']['error'])
    def test_impossible_locked_wind_guard_rejects_both_bounded_candidates(self):
        bad={'version':1,'requiredEvents':[],'cases':[{'id':'Locked wind cannot change','trace':{'version':1,'durationMs':1000,'initial':{'speed':0,'air':1,'grounded':0,'alive':1},'commands':[]},'expect':{'events':{},'maxPreLimitPeak':.9,'minRMS':0,'silence':[{'fromMs':300,'toMs':900,'maxRMS':0}]},'provenance':{'kind':'synthetic','source':'Deliberately impossible guard for pickup-only edit'}}]}
        with patch.object(server,'model_request',return_value=(PATCH,{'model':'synthetic-fixture'})) as model:
            _,info=self.call(self.request(bad))
        self.assertFalse(info['verified']);self.assertEqual(model.call_count,2);self.assertIn('Gameplay contract failed',info['validationError']);self.assertTrue(all(not a['verification']['contract']['pass'] for a in info['attempts']))
        self.assertIn('silence',model.call_args_list[1].args[1]);self.assertEqual(len(list((self.root/'evidence').glob('*.json'))),2)
    def test_candidate_timeout_after_preflight_does_not_retry_model(self):
        original=subprocess.run
        def run(args,**kw):
            if str(args[1]).endswith('check-authoring.mjs'):raise subprocess.TimeoutExpired('node',15)
            return original(args,**kw)
        with patch.object(server,'model_request',return_value=(PATCH,{'model':'synthetic-fixture'})) as model,patch.object(server.subprocess,'run',side_effect=run):
            _,info=self.call(self.request())
        self.assertTrue(info['infrastructureError']);self.assertEqual(model.call_count,1)
    def test_actual_checker_filesystem_failure_is_not_a_model_repair(self):
        script="import fs from 'node:fs';const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{if(String(p).endsWith('bindings.json'))throw Object.assign(new Error('Fixture binding manifest unavailable'),{code:'ENOENT'});return read(p,...args);};await import('./check-authoring.mjs');"
        output=subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'kind':'patch','request':self.request(),'result':PATCH}).encode(),capture_output=True,timeout=15)
        checked=json.loads(output.stdout);self.assertTrue(checked['infrastructureError'])
        original=subprocess.run
        def run(args,**kw):
            return output if str(args[1]).endswith('check-authoring.mjs') else original(args,**kw)
        with patch.object(server,'model_request',return_value=(PATCH,{'model':'synthetic-fixture'})) as model,patch.object(server.subprocess,'run',side_effect=run):
            _,info=self.call(self.request())
        self.assertTrue(info['infrastructureError']);self.assertEqual(model.call_count,1)
    def test_maximum_bank_and_contract_fit_complete_validation_budget(self):
        raw=io.BytesIO()
        with wave.open(raw,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b''.join(struct.pack('<h',4096 if i%2 else -4096) for i in range(24576)))
        asset={'filename':'synthetic-square.wav','license':'Original synthetic arithmetic fixture, not a real recording','wav64':base64.b64encode(raw.getvalue()).decode()}
        project={'version':1,'name':'Maximum permitted bank control','rig':json.loads(json.dumps(RIG)),'assets':{k:asset for k in json.loads((ROOT/'assets/catalog.json').read_text())},'clearMix':True}
        project['rig']['master']=.8
        for l in project['rig']['layers']:
            if l['event']:l['gain']=1;l['rate']=.75
        extra=json.loads(json.dumps(project['rig']['layers'][0]));extra.update(id='extra_continuous',gain=1,pulseHz=12,when=[]);project['rig']['layers'].append(extra)
        pack,report=prepare_project(project);self.assertEqual(report['encodedPCMBytes'],524288)
        began=time.monotonic();r=subprocess.run(['node',str(ROOT/'test-contract-budget.mjs')],input=json.dumps({'project':project,'pack':pack,'report':report}).encode(),capture_output=True,timeout=15)
        self.assertEqual(r.returncode,0,r.stderr.decode());measured=json.loads(r.stdout);measured['coldProcessPlusWarmWallSeconds']=time.monotonic()-began
        (ROOT/'evidence/workflow-budget.json').write_text(json.dumps(measured,indent=2));self.assertTrue(measured['pass'])
    def test_failed_export_does_not_publish_verified_package(self):
        project=json.loads((ROOT/'exports/browser-runnable/project.json').read_text());bad=json.loads(json.dumps(CONTRACT));bad['cases'][0]['expect']['events']['pickup']['count']=99
        with self.assertRaisesRegex(ValueError,'Gameplay checks failed'):
            project_api.workflow_endpoint({'project':project,'contract':bad,'bindings':json.loads((ROOT/'fixtures/game-bindings.json').read_text()),'trace':CONTRACT['cases'][0]['trace']})
    def test_offline_package_checks_and_stale_data_controls(self):
        project=json.loads((ROOT/'exports/browser-runnable/project.json').read_text());bindings=json.loads((ROOT/'fixtures/game-bindings.json').read_text())
        result=project_api.workflow_endpoint({'project':project,'contract':CONTRACT,'bindings':bindings,'trace':CONTRACT['cases'][0]['trace']})
        controls=[]
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder)
            with zipfile.ZipFile(ROOT/result['url']) as z:self.assertIsNone(z.testzip());self.assertEqual(len(z.namelist()),17);z.extractall(folder)
            original={name:(folder/name).read_bytes() for name in ['project.json','bindings.json','contract.json','component.mjs']}
            def verify(label,code):
                r=subprocess.run(['node','verify.mjs'],cwd=folder,capture_output=True,text=True,timeout=15);self.assertEqual(r.returncode,code,r.stdout+r.stderr);controls.append({'name':label,'exit':r.returncode,'pass':True})
            verify('matching project and component',0)
            p=json.loads(original['project.json']);p['rig']['master']=0;(folder/'project.json').write_text(json.dumps(p));verify('stale editable recipe',2);(folder/'project.json').write_bytes(original['project.json'])
            p=json.loads(original['project.json']);p['clearMix']=not p['clearMix'];(folder/'project.json').write_text(json.dumps(p));verify('stale project mix',2);(folder/'project.json').write_bytes(original['project.json'])
            p=json.loads(original['bindings.json']);p['version']=2;(folder/'bindings.json').write_text(json.dumps(p));verify('invalid binding version',2);(folder/'bindings.json').write_bytes(original['bindings.json'])
            p=json.loads(original['contract.json']);p['cases'][0]['expect']['maxPreLimitPeak']=.00001;(folder/'contract.json').write_text(json.dumps(p));verify('tightened headroom actually fails signal check',1);(folder/'contract.json').write_bytes(original['contract.json'])
            (folder/'component.mjs').write_bytes(original['component.mjs']+b'\n');verify('component bytes changed',2)
        (ROOT/'evidence/workflow-package-controls.json').write_text(json.dumps({'pass':True,'controls':controls,'scope':'Actual generated/extracted package, synthetic mutations, no model/server dependency in verifier. Browser download checked separately.'},indent=2))

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(WorkflowTests))
    (ROOT/'evidence/workflow-server-test.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'scope':'Actual Node validators, maximum permitted bank/contract workload and explicit synthetic model fixtures; no new inference calls.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)

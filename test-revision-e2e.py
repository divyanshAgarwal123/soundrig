"""Real snapshot/store/independent-export roundtrip, no model invocation."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,unittest,zipfile
from revision_store import RevisionStore
from project_api import workflow_endpoint
ROOT=Path(__file__).resolve().parent
class RoundTrip(unittest.TestCase):
 def test_captured_revision_to_independent_workflow(self):
  portable=json.loads((ROOT/'fixtures/revision-browser-session.json').read_text());snapshot=portable['snapshot']
  with tempfile.TemporaryDirectory() as temp:
   store=RevisionStore(Path(temp)/'history');record=store.save(portable['label'],snapshot)
   reopened=RevisionStore(store.folder).load(record['id'])
   self.assertEqual(reopened,snapshot);self.assertEqual(reopened['project']['assets'],snapshot['project']['assets'])
   request={k:reopened[k] for k in ('project','trace','contract')};request['bindings']=json.loads((ROOT/'fixtures/game-bindings.json').read_text())
   generated=workflow_endpoint(request)
   archives=[ROOT/generated['url'],ROOT/'fixtures/revision-browser-workflow.zip']
   verified=[]
   for i,archive in enumerate(archives):
    folder=Path(temp)/str(i);folder.mkdir()
    with zipfile.ZipFile(archive) as z:
     self.assertIsNone(z.testzip())
     for name in z.namelist():self.assertFalse(Path(name).is_absolute());self.assertNotIn('..',Path(name).parts)
     self.assertEqual(json.loads(z.read('project.json')),reopened['project']);self.assertEqual(json.loads(z.read('contract.json')),reopened['contract']);z.extractall(folder)
    result=subprocess.run(['node','verify.mjs'],cwd=folder,capture_output=True,text=True,timeout=30)
    self.assertEqual(result.returncode,0,result.stderr+result.stdout);report=json.loads(result.stdout);self.assertTrue(report['pass']);self.assertEqual(len(report['cases']),4)
    verified.append({'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'checks':len(report['cases']),'componentSHA256':report['componentSHA256']})
   self.assertEqual(verified[0]['componentSHA256'],verified[1]['componentSHA256'])
   for name,count in [('revision-browser-phaser.zip',24),('revision-browser-godot.zip',31)]:
    with zipfile.ZipFile(ROOT/'fixtures'/name) as z:self.assertEqual(len(z.namelist()),count);self.assertIsNone(z.testzip());self.assertEqual(json.loads(z.read('project.json')),snapshot['project'])
   (ROOT/'evidence/revision-e2e.json').write_text(json.dumps({'pass':True,'originalWAVAndSourceNotesRetained':True,'snapshotSurvivedStoreReopen':True,'realCapturedCommands':len(snapshot['trace']['commands']),'independentExports':verified,'newModelCalls':0,'scope':'Real saved browser session, SQLite reopen, regenerated and browser-downloaded independent verifiers; no fresh model, outside user or physical listening judgment.'},indent=2))
if __name__=='__main__':unittest.main()

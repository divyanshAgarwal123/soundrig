import concurrent.futures,copy,json,os,sqlite3,tempfile,time,unittest,base64,io,math,struct,wave,subprocess,sys,resource
from pathlib import Path
from revision_store import RevisionStore,validate_snapshot,bounded_tree,MAX_SNAPSHOT
ROOT=Path(__file__).resolve().parent
read=lambda n:json.loads((ROOT/n).read_text())
SNAP={'version':1,'project':read('fixtures/studio-example-project.json'),'trace':read('example-trace.json'),'traceProvenance':{'kind':'synthetic','source':'Revision fixture'},'contract':read('fixtures/workflow-release-contract.json'),'protection':True}
class Tests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.store=RevisionStore(Path(self.tmp.name)/'private',validator=lambda s:copy.deepcopy(s))
 def tearDown(self):self.tmp.cleanup()
 def test_real_validation(self):
  result=validate_snapshot(SNAP);self.assertEqual(result['project']['assets'],SNAP['project']['assets']);self.assertEqual(result['contract'],SNAP['contract']);self.assertNotIn('report',result)
 def test_restart_and_permissions(self):
  saved=self.store.save('One',SNAP);fresh=RevisionStore(self.store.folder,validator=lambda s:s);self.assertEqual(fresh.load(saved['id']),SNAP)
  for p,mode in [(self.store.folder,0o700),(self.store.db,0o600)]:self.assertEqual(os.stat(p).st_mode&0o777,mode)
 def test_metadata_only(self):
  self.store.save('One',SNAP);self.assertNotIn('wav64',json.dumps(self.store.listing()))
 def test_count_and_byte_quota(self):
  self.store.max_count=1;one=self.store.save('One',SNAP)
  with self.assertRaisesRegex(ValueError,'full'):self.store.save('Two',SNAP)
  self.store.max_count=24;self.store.max_bytes=self.store.listing()['usedBytes']
  with self.assertRaisesRegex(ValueError,'full'):self.store.save('Three',SNAP)
  self.assertEqual(self.store.load(one['id']),SNAP);self.assertEqual(len(self.store.listing()['revisions']),1)
 def test_concurrent_quota(self):
  self.store.max_count=3;self.store.listing()
  def save(i):
   try:self.store.save(str(i),SNAP);return True
   except ValueError:return False
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:self.assertEqual(sum(pool.map(save,range(8))),3)
 def test_failed_write_rollback(self):
  one=self.store.save('Existing',SNAP)
  with sqlite3.connect(self.store.db) as con:con.execute("CREATE TRIGGER fail_insert BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
  with self.assertRaises(sqlite3.IntegrityError):self.store.save('Failed',SNAP)
  self.assertEqual([r['id'] for r in self.store.listing()['revisions']],[one['id']])
 def test_corruption(self):
  one=self.store.save('One',SNAP)
  with sqlite3.connect(self.store.db) as con:con.execute('UPDATE revisions SET payload=? WHERE id=?',(b'{}',one['id']))
  with self.assertRaisesRegex(ValueError,'integrity'):self.store.load(one['id'])
 def test_invalid_ids_labels(self):
  for bad in ['../history','x'*32,None]:
   with self.assertRaises(ValueError):self.store.load(bad)
  for bad in ['', 'x'*81,'bad\nname']:
   with self.assertRaises(ValueError):self.store.save(bad,SNAP)
 def test_remove_isolated(self):
  one=self.store.save('One',SNAP);two=self.store.save('Two',SNAP);self.store.remove(one['id']);self.assertEqual(self.store.load(two['id']),SNAP)
  with self.assertRaisesRegex(ValueError,'no longer'):self.store.load(one['id'])
 def test_deep_and_large(self):
  deep={};cur=deep
  for _ in range(34):cur['x']={};cur=cur['x']
  with self.assertRaisesRegex(ValueError,'nesting'):bounded_tree(deep)
  big=copy.deepcopy(SNAP);big['project']['name']='x'*MAX_SNAPSHOT
  with self.assertRaises(ValueError):validate_snapshot(big)
 def test_invalid_snapshots(self):
  for field,value in [('contract',{'version':1,'requiredEvents':[],'cases':[]}),('traceProvenance',{'kind':'unknown','source':'fake'}),('protection','yes')]:
   bad=copy.deepcopy(SNAP);bad[field]=value
   with self.assertRaises(ValueError):validate_snapshot(bad)
  bad=copy.deepcopy(SNAP);bad['project']['assets']['pickup_confirm']['wav64']='invalid'
  with self.assertRaises(ValueError):validate_snapshot(bad)
 def test_symlink(self):
  self.store.folder.mkdir();other=Path(self.tmp.name)/'other';other.write_bytes(b'keep');self.store.db.symlink_to(other)
  with self.assertRaisesRegex(ValueError,'symbolic'):self.store.listing()
  self.assertEqual(other.read_bytes(),b'keep')
 def test_interrupted_transaction(self):
  one=self.store.save('Existing',SNAP)
  code="import sqlite3,sys,time;c=sqlite3.connect(sys.argv[1]);c.execute('BEGIN IMMEDIATE');c.execute(\"UPDATE revisions SET label='uncommitted'\");print('ready',flush=True);time.sleep(20)"
  child=subprocess.Popen([sys.executable,'-c',code,str(self.store.db)],stdout=subprocess.PIPE,text=True)
  try:self.assertEqual(child.stdout.readline().strip(),'ready');child.terminate();child.wait(timeout=5)
  finally:
   if child.poll() is None:child.kill();child.wait()
   child.stdout.close()
  self.assertEqual(self.store.listing()['revisions'][0]['label'],'Existing');self.assertEqual(self.store.load(one['id']),SNAP)
 def test_large_valid_snapshot_and_byte_quota(self):
  raw=io.BytesIO()
  with wave.open(raw,'wb') as out:
   out.setnchannels(2);out.setsampwidth(2);out.setframerate(48000)
   pcm=bytearray(72000*4)
   for i in range(33000,39000):
    sample=round(math.sin(i*2*math.pi*997/48000)*6000);struct.pack_into('<hh',pcm,i*4,sample,sample)
   out.writeframes(pcm)
  encoded=base64.b64encode(raw.getvalue()).decode();snap=copy.deepcopy(SNAP)
  slots=list(json.loads((ROOT/'assets/catalog.json').read_text()))
  snap['project']['assets']={slot:{'filename':slot+'.wav','license':'Synthetic padded stereo budget fixture','wav64':encoded} for slot in slots}
  real=RevisionStore(Path(self.tmp.name)/'large-real');start=time.perf_counter();record=real.save('Large valid',snap);save=time.perf_counter()-start
  start=time.perf_counter();self.assertEqual(real.load(record['id'])['project']['assets'],snap['project']['assets']);load=time.perf_counter()-start
  fast=RevisionStore(Path(self.tmp.name)/'large-quota',validator=lambda s:s)
  while True:
   try:fast.save('Retained',snap)
   except ValueError as error:self.assertIn('full',str(error));break
  listing=fast.listing();self.assertLess(len(listing['revisions']),24);self.assertLessEqual(listing['usedBytes'],fast.max_bytes)
  start=time.perf_counter();fast.listing();listed=time.perf_counter()-start
  (ROOT/'evidence/revision-large-performance.json').write_text(json.dumps({'snapshotBytes':record['bytes'],'validatedSaveSeconds':save,'validatedLoadSeconds':load,'retainedRecordsAtByteQuota':len(listing['revisions']),'logicalBytes':listing['usedBytes'],'physicalDatabaseBytes':fast.db.stat().st_size,'metadataListMs':listed*1000,'processPeakRSSRaw':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'rssUnit':'bytes on macOS, KiB on Linux','scope':'Synthetic1.5s stereo padded originals in all8slots, real validation once each save/load; quota fill uses already validated data. Process high-water RSS, not incremental browser memory or human time.'},indent=2))
 def test_measurement(self):
  began=time.perf_counter()
  for i in range(24):self.store.save('Version '+str(i),SNAP)
  elapsed=time.perf_counter()-began;times=[]
  for _ in range(20):
   began=time.perf_counter();self.store.listing();times.append((time.perf_counter()-began)*1000)
  report={'records':24,'logicalSnapshotBytes':self.store.listing()['usedBytes'],'physicalDatabaseBytes':self.store.db.stat().st_size,'save24Seconds':elapsed,'listMedianMs':sorted(times)[10],'listMaxMs':max(times),'scope':'Prevalidated snapshots: SQLite/serialization only, excludes WAV/validator/worklet and human time.'}
  (ROOT/'evidence/revision-storage-performance.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':unittest.main()

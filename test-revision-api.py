import json,unittest,urllib.request,urllib.error,http.client
from pathlib import Path
BASE='http://127.0.0.1:8772'
ROOT=Path(__file__).resolve().parent
class Tests(unittest.TestCase):
 def post(self,data,origin=BASE,header='local-proof'):
  raw=data if isinstance(data,bytes) else json.dumps(data).encode()
  r=urllib.request.Request(BASE+'/api/revisions',data=raw,headers={'Content-Type':'application/json','Origin':origin,'X-SoundRig':header})
  try:
   with urllib.request.urlopen(r,timeout=30) as x:return x.status,json.load(x)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def test_metadata_and_no_model_calls(self):
  before=json.load(urllib.request.urlopen(BASE+'/api/status'))['calls'];status,result=self.post({'action':'list'});self.assertEqual(status,200);self.assertIn('maxCount',result);self.assertNotIn('wav64',json.dumps(result));self.assertEqual(before,json.load(urllib.request.urlopen(BASE+'/api/status'))['calls'])
 def test_cross_origin_and_header(self):
  self.assertEqual(self.post({'action':'list'},origin='https://outside.invalid')[0],403);self.assertEqual(self.post({'action':'list'},header='wrong')[0],403)
 def test_private_files_and_modules(self):
  for name in ['.soundrig-revisions/history.sqlite3','revision_store.py']:
   with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(BASE+'/'+name)
   self.assertEqual(e.exception.code,404)
  self.assertEqual(urllib.request.urlopen(BASE+'/revision-data.mjs').status,200)
 def test_invalid_inputs(self):
  for data in [{'action':'load','id':'../../history'},{'action':'save','label':'x','snapshot':{}},{'action':'other'},{'action':'list','extra':1},b'{']:
   self.assertEqual(self.post(data)[0],400)
  self.assertEqual(self.post(b'{"action":"save","snapshot":'+b'['*1200+b'0'+b']'*1200+b'}')[0],400)
 def test_timeout_error_is_not_meta_failure(self):
  from io import BytesIO
  from unittest.mock import Mock,patch
  import server,subprocess
  h=server.Handler.__new__(server.Handler);h.path='/api/revisions';raw=b'{"action":"load","id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
  h.headers={'Origin':BASE,'X-SoundRig':'local-proof','Content-Length':str(len(raw))};h.connection=Mock();h.rfile=BytesIO(raw);h.reply=Mock()
  with patch.object(server,'revision_endpoint',side_effect=subprocess.TimeoutExpired(['node'],15)):h.do_POST()
  status,result=h.reply.call_args.args;self.assertEqual(status,504);self.assertIn('Current work is unchanged',result['error']);self.assertNotIn('Meta',result['error'])
 def test_oversize(self):
  c=http.client.HTTPConnection('127.0.0.1',8772);c.putrequest('POST','/api/revisions');c.putheader('Content-Length',str(5*1024*1024+1025));c.putheader('X-SoundRig','local-proof');c.endheaders();self.assertEqual(c.getresponse().status,400);c.close()
if __name__=='__main__':unittest.main()

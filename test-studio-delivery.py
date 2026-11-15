"""Actual cue ZIP/WAV boundaries and local HTTP rejection paths; no inference."""
import base64,copy,hashlib,io,json,socket,struct,subprocess,tempfile,unittest,urllib.error,urllib.request,uuid,wave,zipfile
from pathlib import Path
from delivery import delivery_endpoint
from project_assets import prepare_project
ROOT=Path(__file__).resolve().parent
PROJECT=json.loads((ROOT/'fixtures/studio-example-project.json').read_text())
BASE='http://127.0.0.1:8772'

class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result=delivery_endpoint({'project':PROJECT});cls.archive=ROOT/cls.result['url']
    def test_versioned_quality_and_rejection(self):
        prepare_project(PROJECT)
        legacy=copy.deepcopy(PROJECT);legacy.pop('quality');legacy['version']=1;prepare_project(legacy)
        for data in [{**PROJECT,'quality':'unknown'},{k:v for k,v in PROJECT.items() if k!='quality'},{**PROJECT,'version':1}]:
            with self.assertRaises(ValueError):prepare_project(data)
    def test_fixed_zip_paths_and_deterministic_bytes(self):
        before=self.archive.read_bytes();again=delivery_endpoint({'project':PROJECT})
        self.assertEqual(again['digest'],self.result['digest']);self.assertEqual(before,self.archive.read_bytes())
        with zipfile.ZipFile(self.archive) as z:
            self.assertEqual(len(z.namelist()),24);self.assertIsNone(z.testzip());self.assertLessEqual(sum(x.file_size for x in z.infolist()),12000*1024)
            self.assertTrue(all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist()))
            self.assertEqual(z.read('fonts/SoundRigDisplay.ttf'),(ROOT/'fonts/SoundRigDisplay.ttf').read_bytes());self.assertIn('vendor/phaser.min.js',z.namelist());self.assertIn('vendor/PHASER-LICENSE.md',z.namelist())
    def test_wav_sprite_frames_hashes_and_source_declarations(self):
        with zipfile.ZipFile(self.archive) as z:
            manifest=json.loads(z.read('manifest.json'));markers=json.loads(z.read('sprite.json'))['spritemap'];project=json.loads(z.read('project.json'))
            self.assertEqual(project,PROJECT);self.assertEqual(manifest['quality'],'studio')
            with wave.open(io.BytesIO(z.read('sprite.wav'))) as w:
                self.assertEqual((w.getframerate(),w.getsampwidth(),w.getnchannels()),(48000,2,1));sprite=w.readframes(w.getnframes())
            prior=0
            for i,clip in enumerate(manifest['clips']):
                raw=z.read(clip['file']);self.assertEqual(hashlib.sha256(raw).hexdigest(),clip['wavSHA256'])
                with wave.open(io.BytesIO(raw)) as w:
                    self.assertEqual(w.getnframes(),clip['frames']);self.assertLessEqual(w.getnframes(),100800);pcm=w.readframes(w.getnframes())
                start,end=clip['startFrame'],clip['endFrame'];self.assertEqual(pcm,sprite[start*2:end*2])
                self.assertEqual(sprite[prior*2:start*2],bytes((start-prior)*2));self.assertAlmostEqual(markers[clip['id']]['start']*48000,start,places=6);self.assertAlmostEqual(markers[clip['id']]['end']*48000,end,places=6);prior=end
            self.assertEqual(len(manifest['clips']),11);self.assertLessEqual(sum(c['frames'] for c in manifest['clips']),24*48000)
            self.assertIn('Kenney',project['assets']['pickup_confirm']['license']);self.assertIn('CC0',z.read('licenses/interface-CC0.txt').decode())
    def test_rejected_cue_does_not_publish_a_partial_pack(self):
        before=set((ROOT/'exports').iterdir());bad=copy.deepcopy(PROJECT);next(l for l in bad['rig']['layers'] if l['event']=='pickup')['gain']=0
        with self.assertRaises(ValueError):delivery_endpoint({'project':bad})
        self.assertEqual(before,set((ROOT/'exports').iterdir()))
    def test_valid_twenty_millisecond_import_delivers_without_added_lead_in(self):
        raw=io.BytesIO()
        with wave.open(raw,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000)
            w.writeframes(b''.join(struct.pack('<h',4096 if i%48<24 else -4096) for i in range(960)))
        project=copy.deepcopy(PROJECT);project['assets']['pickup_confirm']={'filename':'short.wav','license':'Original synthetic short-cue control','wav64':base64.b64encode(raw.getvalue()).decode()}
        result=delivery_endpoint({'project':project})
        with zipfile.ZipFile(ROOT/result['url']) as z:
            with wave.open(io.BytesIO(z.read('audio/pickup_01.wav'))) as w:
                self.assertEqual(w.getnframes(),4800);pcm=list(struct.iter_unpack('<h',w.readframes(4800)))
            self.assertTrue(any(abs(x[0])>1 for x in pcm[:240]),'Cue should begin before5ms, without an added10ms lead-in')
    def test_metadata_does_not_become_an_archive_path(self):
        project=copy.deepcopy(PROJECT);project['name']='<img src=x onerror=alert(1)>'
        project['assets']['pickup_confirm']['filename']='../not-a-path.wav'
        result=delivery_endpoint({'project':project})
        with zipfile.ZipFile(ROOT/result['url']) as z:
            self.assertTrue(all('not-a-path' not in n for n in z.namelist()));self.assertNotIn(project['name'],z.read('index.html').decode());self.assertEqual(json.loads(z.read('project.json'))['name'],project['name'])
    def test_server_excludes_journals_development_paths_and_symlinks(self):
        def get(path):
            try:return urllib.request.urlopen(BASE+path,timeout=5).status
            except urllib.error.HTTPError as e:return e.code
        for path in ['/server.py','/.impeccable/build/spec.json','/evidence/patch-07e0b7354877.json','/%2e%2e/project/server.py','/evidence/authoring-any.json','/test-studio-quality.mjs']:
            self.assertEqual(get(path),404,path)
        link=ROOT/'assets'/('private-test-'+uuid.uuid4().hex+'.png');link.symlink_to(ROOT/'server.py')
        try:self.assertEqual(get('/assets/'+link.name),404)
        finally:link.unlink()
        for path in ['/','/studio.html','/guide.html','/site.css','/fixtures/studio-example-project.json','/assets/plates/record.png','/worklet.mjs','/exported.html']:
            self.assertEqual(get(path),200,path)
    def test_http_delivery_rejects_foreign_origin_without_model_calls(self):
        before=json.load(urllib.request.urlopen(BASE+'/api/status'))['calls']
        request=urllib.request.Request(BASE+'/api/delivery',data=b'{}',headers={'X-SoundRig':'local-proof','Origin':'https://example.com'})
        with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request)
        self.assertEqual(error.exception.code,403)
        self.assertEqual(json.load(urllib.request.urlopen(BASE+'/api/status'))['calls'],before)
    def test_incomplete_request_body_has_a_deadline(self):
        with socket.create_connection(('127.0.0.1',8772),timeout=8) as connection:
            connection.sendall(b'POST /api/delivery HTTP/1.1\r\nHost: 127.0.0.1:8772\r\nX-SoundRig: local-proof\r\nContent-Length: 100\r\n\r\n{')
            response=connection.recv(4096)
        self.assertIn(b' 408 ',response.split(b'\r\n')[0])

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(StudioTests))
    (ROOT/'evidence/studio-delivery-tests.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'files':24,'scope':'Actual generated ZIP, WAV/sprite frame identity, metadata/atomic controls and local HTTP checks. Actual browser download/playback checked separately.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)

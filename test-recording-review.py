from pathlib import Path
import base64,copy,hashlib,io,json,math,struct,time,unittest,wave,urllib.request,urllib.error
from sound_review import review_endpoint
from project_assets import prepare_wav
from project_api import ADMISSION,ProjectBusy
ROOT=Path(__file__).resolve().parent

def decoded(encoded):
    with wave.open(io.BytesIO(base64.b64decode(encoded)),'rb') as w:return [x[0]/32768 for x in struct.iter_unpack('<h',w.readframes(w.getnframes()))]

def recording():
    values=[.1]*4800+[.1+.3*math.sin(2*math.pi*997*i/48000) for i in range(12000)]+[.1]*4800
    output=io.BytesIO()
    with wave.open(output,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b''.join(struct.pack('<h',round(x*32768)) for x in values))
    return {'filename':'controlled.wav','license':'Original synthetic DC/padding control','wav64':base64.b64encode(output.getvalue()).decode()}

class ReviewTests(unittest.TestCase):
    def test_same_preparation_and_source_identity(self):
        item=recording();before=copy.deepcopy(item);started=time.monotonic();r=review_endpoint({'asset':item})
        self.assertEqual(item,before);self.assertEqual(r['preparedPCM16'],prepare_wav(item)['pcm16']);self.assertEqual(r['report']['sourceSHA256'],hashlib.sha256(base64.b64decode(item['wav64'])).hexdigest())
        self.assertLess(abs(r['report']['dc']),1/32768);self.assertGreater(abs(r['report']['sourceDC']),.09)
        self.assertGreater(r['report']['trimmedLeadingSeconds'],.09);self.assertGreater(r['report']['trimmedTrailingSeconds'],.09)
        raw=list(struct.iter_unpack('<h',base64.b64decode(r['preparedPCM16'])));self.assertEqual(raw[0][0],0);self.assertEqual(raw[-1][0],0)
        levels=[]
        for name in ['original','prepared']:
            values=decoded(r['comparison'][name]);self.assertLessEqual(max(map(abs,values)),.8001);levels.append(math.sqrt(sum(x*x for x in values)/len(values)))
        self.assertLess(abs(levels[0]-levels[1]),1/32768);self.assertLess(time.monotonic()-started,1.5)
    def test_clipping_warning_does_not_claim_repair(self):
        item=recording();raw=bytearray(base64.b64decode(item['wav64']));struct.pack_into('<h',raw,44+6000*2,32767);item['wav64']=base64.b64encode(raw).decode()
        r=review_endpoint({'asset':item});self.assertEqual(r['report']['sourceNearFullScaleSamples'],1);self.assertTrue(any('cannot restore' in x for x in r['report']['warnings']))
    def test_bad_input_and_admission_release(self):
        for data in ({},{'asset':{'wav64':'bad'}},{'asset':recording(),'path':'../x'}):
            with self.assertRaises(ValueError):review_endpoint(data)
        self.assertTrue(ADMISSION.acquire(blocking=False))
        try:
            with self.assertRaises(ProjectBusy):review_endpoint({'asset':recording()})
        finally:ADMISSION.release()
        self.assertIn('report',review_endpoint({'asset':recording()}))
    def test_new_endpoints_keep_http_boundary(self):
        for endpoint in ['/api/review-sound','/api/godot-export']:
            request=urllib.request.Request('http://127.0.0.1:8772'+endpoint,data=b'{}',headers={'Origin':'https://example.com','X-SoundRig':'local-proof'})
            with self.assertRaises(urllib.error.HTTPError) as err:urllib.request.urlopen(request)
            self.assertEqual(err.exception.code,403)

if __name__=='__main__':
    result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(ReviewTests))
    (ROOT/'evidence/practical-recording-tests.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'scope':'Existing preparation identity, source retention, matched RMS, DC/edge/padding controls, warnings, admission and HTTP boundary. No listening preference claim.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)

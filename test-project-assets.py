from pathlib import Path
import base64, hashlib, io, json, math, struct, unittest, wave
from project_assets import prepare_wav,prepare_project
ROOT=Path(__file__).resolve().parent

def wav(seconds=.5,rate=48000,channels=1,bias=.15,cancel=False,width=2):
    data=io.BytesIO()
    with wave.open(data,'wb') as out:
        out.setnchannels(channels);out.setsampwidth(width);out.setframerate(rate)
        values=[]
        for i in range(round(seconds*rate)):
            x=bias+.3*math.sin(2*math.pi*997*i/rate)
            for channel in range(channels):values.append(round(x*32767)*(-1 if cancel and channel else 1))
        out.writeframes(b''.join(struct.pack('<h',x) for x in values) if width==2 else b'\0'*(len(values)*width))
    return data.getvalue()

def item(raw,filename='fixture.wav',note='Original synthetic validation fixture'):
    return dict(filename=filename,license=note,wav64=base64.b64encode(raw).decode())

PROJECT=json.loads((ROOT/'exports/browser-imported-project.json').read_text())
PACK,REPORT=prepare_project(PROJECT)

class Assets(unittest.TestCase):
    def test_actual_imported_sounds_retain_rate_hash_and_rights(self):
        self.assertEqual(len(PACK),2)
        for key,s in PACK.items():
            self.assertEqual(s['sampleRate'],48000);self.assertEqual(s['sourceChannels'],2)
            self.assertEqual(s['sourceSHA256'],hashlib.sha256(base64.b64decode(PROJECT['assets'][key]['wav64'])).hexdigest())
            self.assertEqual(s['licenseNote'],PROJECT['assets'][key]['license'])
            pcm=base64.b64decode(s['pcm16']);self.assertEqual(pcm[:2],b'\0\0');self.assertEqual(pcm[-2:],b'\0\0')
            self.assertLess(abs(s['dc']),2e-5);self.assertLessEqual(s['peak'],.8);self.assertAlmostEqual(s['rms'],.12,places=5)
    def test_dc_stereo_preparation_has_zero_endpoints_headroom_and_bounded_gain(self):
        s=prepare_wav(item(wav(channels=2,bias=.2)));self.assertGreater(s['sourceDC'],.19)
        self.assertLess(abs(s['dc']),2e-5);self.assertLessEqual(s['peak'],.8);self.assertLessEqual(s['preparationGain'],4)
        pcm=base64.b64decode(s['pcm16']);self.assertEqual(pcm[:2],pcm[-2:]);self.assertEqual(pcm[:2],b'\0\0')
    def test_silence_constant_dc_and_stereo_cancellation_reject(self):
        for raw in [wav(cancel=True,channels=2),wav(width=4)]:
            with self.assertRaises(ValueError):prepare_wav(item(raw))
        data=io.BytesIO()
        with wave.open(data,'wb') as f:f.setparams((1,2,24000,0,'NONE',''));f.writeframes(struct.pack('<h',1000)*12000)
        with self.assertRaises(ValueError):prepare_wav(item(data.getvalue()))
    def test_malformed_lengths_base64_and_size_reject(self):
        raw=wav()
        for bad in [b'notwav',raw[:-1],raw+b'extra',raw[:16]+b'\xff\xff\xff\x7f'+raw[20:],b'x'*409601]:
            with self.assertRaises(ValueError):prepare_wav(item(bad))
        with self.assertRaises(ValueError):prepare_wav({'filename':'x','license':'test','wav64':'!!!'})
    def test_unsupported_rates_durations_and_missing_provenance_reject(self):
        for raw in [wav(rate=16000),wav(seconds=1.51),wav(seconds=.002)]:
            with self.assertRaises(ValueError):prepare_wav(item(raw))
        for extra in [{'license':''},{'filename':''},{'code':'x'}]:
            bad=item(wav());bad.update(extra)
            with self.assertRaises(ValueError):prepare_wav(bad)
    def test_metadata_is_retained_as_data(self):
        s=prepare_wav(item(wav(),filename='"export <script>測試.wav',note='CC0 export text </script> "quoted"'))
        self.assertIn('export ',s['title']);self.assertIn('</script>',s['licenseNote'])
    def test_asymmetric_transient_padding_is_trimmed_before_dc_removal(self):
        for bias in [0,.12]:
            raw=io.BytesIO();values=[]
            for i in range(12000):
                signal=.6*math.sin(math.pi*(i-4800)/2400) if 4800<=i<7200 else 0
                values.append(round((bias+signal)*32767))
            with wave.open(raw,'wb') as f:f.setparams((1,2,24000,0,'NONE',''));f.writeframes(b''.join(struct.pack('<h',v) for v in values))
            prepared=prepare_wav(item(raw.getvalue()));self.assertLess(prepared['frames'],2900)
            self.assertGreater(prepared['trimmedLeadingSeconds'],.19);self.assertGreater(prepared['trimmedTrailingSeconds'],.19)
            self.assertLess(abs(prepared['dc']),2e-5)
    def test_partial_frames_and_inconsistent_pcm_format_reject(self):
        raw=wav()
        for field,value,fmt in [(28,1,'<I'),(32,4,'<H')]:
            bad=bytearray(raw);struct.pack_into(fmt,bad,field,value)
            with self.assertRaises(ValueError):prepare_wav(item(bytes(bad)))
        bad=bytearray(raw+b'x\0');struct.pack_into('<I',bad,4,len(bad)-8);struct.pack_into('<I',bad,40,len(raw)-44+1)
        with self.assertRaises(ValueError):prepare_wav(item(bytes(bad)))
    def test_project_schema_and_fixed_ids_reject(self):
        for change in [{'version':2},{'version':True},{'clearMix':1},{'assets':{'other':item(wav())}},{'module':'bad'}]:
            bad={**PROJECT,**change}
            with self.assertRaises(ValueError):prepare_project(bad)
    def test_maximum_representative_bank_fits_and_larger_bank_rejects(self):
        ids=json.loads((ROOT/'assets/catalog.json').read_text()).keys()
        maximum={**PROJECT,'assets':{key:item(wav(bias=0)) for key in ids}}
        pack,report=prepare_project(maximum);self.assertEqual(report['decodedBytesPerRealm'],768000)
        self.assertLessEqual(report['encodedPCMBytes'],524288)
        too_large={**maximum,'assets':{key:item(wav(seconds=1.5,bias=0)) for key in ids}}
        with self.assertRaises(ValueError):prepare_project(too_large)
        (ROOT/'evidence/project-max-bank.json').write_text(json.dumps({'project':maximum,'pack':pack,'report':report}))

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Assets);result=unittest.TextTestRunner(verbosity=1).run(suite)
    (ROOT/'evidence/project-prepared.json').write_text(json.dumps({'project':PROJECT,'pack':PACK,'report':REPORT}))
    (ROOT/'evidence/project-assets-test.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'report':REPORT,'scope':'Actual held-out Kenney imports plus declared synthetic parser/preparation/budget fixtures. Not a human quality preference result.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)

"""Maximum permitted prepared bank and six-case validator, no inference."""
import base64,io,json,struct,subprocess,time,wave
from pathlib import Path
from project_assets import prepare_project
ROOT=Path(__file__).resolve().parent
rig=json.loads((ROOT/'hybrid-rig.json').read_text());raw=io.BytesIO()
with wave.open(raw,'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000)
    w.writeframes(b''.join(struct.pack('<h',4096 if i%2 else -4096) for i in range(24576)))
asset={'filename':'synthetic-square.wav','license':'Original synthetic arithmetic fixture','wav64':base64.b64encode(raw.getvalue()).decode()}
project={'version':2,'quality':'studio','name':'Maximum Studio workload','rig':rig,'assets':{k:asset for k in json.loads((ROOT/'assets/catalog.json').read_text())},'clearMix':True}
rig['master']=.8
for layer in rig['layers']:
    if layer['event']:layer['gain']=1;layer['rate']=.75
extra=json.loads(json.dumps(rig['layers'][0]));extra.update(id='extra_continuous',gain=1,pulseHz=12,when=[]);rig['layers'].append(extra)
pack,report=prepare_project(project);assert report['encodedPCMBytes']==524288
(ROOT/'fixtures/studio-max-input.json').write_text(json.dumps({'project':project,'pack':pack,'report':report}))
began=time.monotonic();p=subprocess.run(['node',str(ROOT/'test-contract-budget.mjs')],input=json.dumps({'project':project,'pack':pack,'report':report}).encode(),capture_output=True,timeout=15)
assert p.returncode==0,p.stderr.decode()[:2000]
measured=json.loads(p.stdout);measured.update(quality='studio',completeColdPlusWarmWallSeconds=time.monotonic()-began)
(ROOT/'evidence/studio-budget.json').write_text(json.dumps(measured,indent=2));print(json.dumps(measured,indent=2))

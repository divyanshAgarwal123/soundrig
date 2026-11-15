"""Execute the authored adapter in a supplied official Godot binary; no model."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,tempfile,time,zipfile
from delivery import delivery_endpoint
ROOT=Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--godot',required=True);parser.add_argument('--archive');args=parser.parse_args()
    binary=Path(args.godot).resolve();version=subprocess.check_output([str(binary),'--headless','--version'],text=True,timeout=15).strip()
    if args.archive:archive=Path(args.archive).resolve()
    else:archive=ROOT/delivery_endpoint({'project':json.loads((ROOT/'fixtures/studio-browser-project.json').read_text())},target='godot')['url']
    reports=[]
    with tempfile.TemporaryDirectory(prefix='soundrig-godot-') as temp:
        root=Path(temp)/'kit';root.mkdir()
        with zipfile.ZipFile(archive) as z:
            assert len(z.namelist())==31 and z.testzip() is None
            for name in z.namelist():assert not Path(name).is_absolute() and '..' not in Path(name).parts
            for name in ('soundrig.gd','test_soundrig.gd','demo.gd','demo.tscn','project.godot'):assert z.read(name)==(ROOT/'godot-kit'/name).read_bytes(),name
            z.extractall(root)
        def run(folder,script='test_soundrig.gd',reject=False):
            start=time.monotonic();command=[str(binary),'--headless','--audio-driver','Dummy','--path',str(folder),'--script',script]
            if reject:command+=['--','--expect-reject']
            p=subprocess.run(command,text=True,capture_output=True,timeout=20)
            assert p.returncode==0 and 'ERROR:' not in p.stderr and 'WARNING:' not in p.stderr,(p.stdout,p.stderr)
            report=json.loads(next(line for line in p.stdout.splitlines() if line.startswith('{')));assert report['pass']
            return {**report,'seconds':round(time.monotonic()-start,3)}
        reports.append({'case':'native-kit',**run(root)})
        nested=Path(temp)/'own-game';nested.mkdir();shutil.copy2(root/'project.godot',nested/'project.godot');shutil.copytree(root,nested/'addons/soundrig')
        reports.append({'case':'relocated-kit-same-call',**run(nested,'addons/soundrig/test_soundrig.gd')})
        # Import/run the actual native cue scene too; script-only tests do not parse it.
        p=subprocess.run([str(binary),'--headless','--audio-driver','Dummy','--path',str(root),'--quit-after','10'],text=True,capture_output=True,timeout=20)
        assert p.returncode==0 and 'ERROR:' not in p.stderr and 'WARNING:' not in p.stderr,(p.stdout,p.stderr)
        reports.append({'case':'native-demo-scene','pass':True})
        wav=root/'audio/pickup_01.wav';original=wav.read_bytes()
        changed=bytearray(original);changed[100]^=1;wav.write_bytes(changed)
        reports.append({'case':'hash-corruption',**run(root,reject=True)})
        wav.write_bytes(original[:24]);reports.append({'case':'truncated-wav',**run(root,reject=True)})
        wav.write_bytes(original)
        with wav.open('r+b') as f:f.truncate(201645)
        reports.append({'case':'oversized-wav-before-read',**run(root,reject=True)})
        wav.write_bytes(original);manifest=root/'manifest.json';manifest.write_text('{')
        reports.append({'case':'malformed-manifest',**run(root,reject=True)})
    result={'pass':True,'engine':version,'archiveSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive':str(archive),'cases':reports,'newModelCalls':0,'scope':'Actual official Godot engine with Dummy audio driver: PCM loading, playback states, native scene, relocation, bounded voices, cleanup and corruption controls. No physical speakers, listening preference, outside developers or human task-time comparison.'}
    (ROOT/'evidence/practical-godot-engine.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))

if __name__=='__main__':main()

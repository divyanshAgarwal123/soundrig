"""Bounded static cue delivery; user data never becomes an archive path."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile
from project_assets import prepare_project
from project_api import ADMISSION, ProjectBusy, validation_error

ROOT=Path(__file__).resolve().parent
LIMIT=12000*1024
FIXED={f'audio/{role}_{take:02}.wav' for role,n in [('land',3),('pickup',3),('hurt',3),('footstep',2)] for take in range(1,n+1)}|{'sprite.wav','sprite.json','manifest.json'}

def delivery_endpoint(data, target='phaser'):
    if not ADMISSION.acquire(blocking=False):
        raise ProjectBusy('Another project is being prepared. Retry after it finishes.')
    try:
        if not isinstance(data,dict) or set(data)!={'project'}:
            raise ValueError('Only an editable project is accepted.')
        if target not in ('phaser','godot'):raise ValueError('Unsupported delivery target.')
        project=data['project'];pack,_=prepare_project(project)
        result=subprocess.run(['node',str(ROOT/'delivery-cli.mjs')],input=json.dumps({'project':project,'pack':pack}).encode(),capture_output=True,timeout=15)
        if result.returncode:raise ValueError('Cue delivery failed: '+validation_error(result))
        if len(result.stdout)>16*1024*1024:raise ValueError('Delivery response exceeds its bound.')
        payload=json.loads(result.stdout)
        if set(payload['files'])!=FIXED:raise ValueError('Unexpected delivery paths.')
        files={}
        for name,item in payload['files'].items():
            if item['encoding']=='base64':files[name]=base64.b64decode(item['data'],validate=True)
            elif item['encoding']=='utf8':files[name]=item['data'].encode()
            else:raise ValueError('Unsupported delivery encoding.')
        files.update({'fonts/SoundRigDisplay.ttf':(ROOT/'fonts/SoundRigDisplay.ttf').read_bytes(),
                      'fonts/OFL.txt':(ROOT/'fonts/ArchivoBlack-OFL.txt').read_bytes(),
                      'project.json':json.dumps(project,indent=2).encode(),
                      'index.html':(ROOT/'delivery-consumer.html').read_bytes(),
                      'consumer.mjs':(ROOT/'delivery-consumer.mjs').read_bytes(),
                      'vendor/phaser.min.js':(ROOT/'vendor/phaser-3.90.0.min.js').read_bytes(),
                      'vendor/PHASER-LICENSE.md':(ROOT/'vendor/PHASER-LICENSE.md').read_bytes(),
                      'licenses/impact-CC0.txt':(ROOT/'licenses/impact-CC0.txt').read_bytes(),
                      'licenses/interface-CC0.txt':(ROOT/'licenses/interface-CC0.txt').read_bytes(),
                      'README.txt':b'SoundRig static game cues. 1 Extract this ZIP. 2 Run python3 -m http.server 8782 --bind 127.0.0.1 here. 3 Open http://127.0.0.1:8782/. 4 Select a cue and press Play cue. No model or authoring server needed.\nUse individual audio/*.wav files in another engine with manual event wiring. Phaser3.90 example: this.load.audioSprite("kit","sprite.json",["sprite.wav"]); then, after a user gesture, this.sound.playAudioSprite("kit","pickup_01").\nThese are static full-intensity cues, not dynamic wind/cadence or a complete engine integration. Takes use authored variation and can match. manifest.json records frames, hashes and source sample IDs; project.json retains original WAV data/source declarations. Declarations do not verify ownership. Phaser is MIT; supplied Kenney sounds CC0.\n'})
        if target=='godot':
            for name in ('project.godot','soundrig.gd','test_soundrig.gd','demo.gd','demo.tscn','GODOT_README.md','SOUNDRIG_LICENSE.txt'):
                files[name]=(ROOT/'godot-kit'/name).read_bytes()
        if sum(map(len,files.values()))>LIMIT:raise ValueError('Delivery exceeds12000KiB uncompressed.')
        digest=hashlib.sha256(b''.join(name.encode()+files[name] for name in sorted(files))).hexdigest()[:12]
        directory=ROOT/'exports'/('delivery-'+digest);archive=ROOT/'exports'/('soundrig-delivery-'+digest+'.zip')
        with tempfile.TemporaryDirectory(dir=ROOT/'exports') as temporary:
            staged=Path(temporary)/'pack';staged.mkdir()
            for name,contents in files.items():
                path=staged/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(contents)
            zipped=Path(temporary)/'delivery.zip'
            with zipfile.ZipFile(zipped,'w',zipfile.ZIP_DEFLATED) as z:
                for name,contents in files.items():
                    info=zipfile.ZipInfo(name,date_time=(2026,11,4,0,0,0));info.external_attr=0o644<<16;z.writestr(info,contents,compress_type=zipfile.ZIP_DEFLATED)
            if zipped.stat().st_size>LIMIT:raise ValueError('Delivery ZIP exceeds12000KiB.')
            if not directory.exists():staged.replace(directory)
            zipped.replace(archive)
        return {'url':'exports/'+archive.name,'host':'exports/'+directory.name+'/index.html','digest':digest,'manifest':payload['manifest'],'files':len(files),'bytes':archive.stat().st_size,'target':target}
    finally:
        ADMISSION.release()

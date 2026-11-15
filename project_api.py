from pathlib import Path
from collections import OrderedDict
import hashlib
import json
import subprocess
import tempfile
import threading
import uuid
import zipfile
from project_assets import prepare_project

ROOT = Path(__file__).resolve().parent
PROJECTS = OrderedDict()
LOCK = threading.Lock()
ADMISSION = threading.BoundedSemaphore(1)


class ProjectBusy(Exception):
    pass


def validation_error(output):
    lines=output.stderr.decode(errors='replace').splitlines()
    return next((line.removeprefix('Error: ') for line in lines if line.startswith('Error: ')), 'Local verification failed')[:350]


def project_snapshot(digest):
    if digest is None:
        return None
    with LOCK:
        if not isinstance(digest, str) or digest not in PROJECTS:
            raise ValueError('Project reference expired. Reopen your saved project before authoring.')
        return PROJECTS[digest]


def build_project(project, trace=None):
    pack, report = prepare_project(project)
    payload = {'project':project, 'pack':pack}
    if trace is not None:payload['trace']=trace
    output = subprocess.run(['node',str(ROOT/'project-cli.mjs')],input=json.dumps(payload).encode(),capture_output=True,timeout=15)
    if output.returncode:
        raise ValueError('Project verification failed: '+validation_error(output))
    result = json.loads(output.stdout)
    result['report'] = {**report,'signal':result['signal'],'exportBytes':result['exportBytes']}
    return result, pack


def atomic_text(path, contents):
    temporary = path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    temporary.write_text(contents);temporary.replace(path)


def project_endpoint(path, data):
    if not ADMISSION.acquire(blocking=False):
        raise ProjectBusy('Another project is being prepared. Retry when it finishes; your current project is unchanged.')
    try:return _project_endpoint(path,data)
    finally:ADMISSION.release()


def _project_endpoint(path, data):
    if set(data)-{'project','trace'}:
        raise ValueError('Only project data and optional trace are accepted.')
    project=data.get('project');result,pack=build_project(project,data.get('trace'))
    digest=hashlib.sha256(json.dumps(project,sort_keys=True).encode()).hexdigest()[:16]
    if path=='/api/project':
        with LOCK:
            PROJECTS[digest]={'project':project,'pack':pack};PROJECTS.move_to_end(digest)
            while len(PROJECTS)>8:PROJECTS.popitem(last=False)
        return {'module':result['module'],'report':result['report'],'digest':digest}
    files={'index.html':(ROOT/'standalone-host.html').read_text(),'host.mjs':(ROOT/'standalone-host.mjs').read_text(),
           'component.mjs':result['module'],'recorder.mjs':(ROOT/'integration-example.mjs').read_text(),
           'project.json':json.dumps(project,indent=2),'trace.json':json.dumps(result['trace'],indent=2),
           'provenance.json':json.dumps(result['report'],indent=2),
           'README.txt':'SoundRig plain JavaScript runner. No model, Phaser or authoring server dependency.\nRun: python3 -m http.server 8780 --bind 127.0.0.1\nOpen http://127.0.0.1:8780/ and Enable audio.\nSee provenance.json for source/license declarations. Ownership was not verified.\n',
           'licenses/impact-CC0.txt':(ROOT/'licenses/impact-CC0.txt').read_text(),
           'licenses/interface-CC0.txt':(ROOT/'licenses/interface-CC0.txt').read_text()}
    return write_package(files,'project',result['report'])


def write_package(files,kind,report):
    files={name:contents.encode() for name,contents in files.items()}
    files.update({'fonts/SoundRigDisplay.ttf':(ROOT/'fonts/SoundRigDisplay.ttf').read_bytes(),'fonts/OFL.txt':(ROOT/'fonts/ArchivoBlack-OFL.txt').read_bytes()})
    export_digest=hashlib.sha256(b''.join(name.encode()+files[name] for name in sorted(files))).hexdigest()[:12]
    exports=ROOT/'exports';directory=exports/(kind+'-'+export_digest)
    with tempfile.TemporaryDirectory(dir=exports) as temporary:
        staged=Path(temporary)/'project';staged.mkdir()
        for name,contents in files.items():
            p=staged/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(contents)
        if not directory.exists():staged.replace(directory)
        archive=exports/('soundrig-'+kind+'-'+export_digest+'.zip');temporary_zip=Path(temporary)/'project.zip'
        with zipfile.ZipFile(temporary_zip,'w',zipfile.ZIP_DEFLATED) as zipped:
            for name,contents in files.items():zipped.writestr(name,contents)
        temporary_zip.replace(archive)
    return {'url':'exports/'+archive.name,'host':'exports/'+directory.name+'/index.html','digest':export_digest,'report':report}


def workflow_endpoint(data,check_only=False):
    if not ADMISSION.acquire(blocking=False):
        raise ProjectBusy('Another project is being prepared. Retry after it finishes.')
    try:
        if set(data)-{'project','trace','contract','bindings'}:
            raise ValueError('Only project, trace, contract and bindings are accepted.')
        if not {'project','contract','bindings'}<=set(data):
            raise ValueError('An editable project, explicit bindings and saved checks are required.')
        project=data['project'];pack,preparation=prepare_project(project)
        process=subprocess.run(['node',str(ROOT/'workflow-cli.mjs')],input=json.dumps({**data,'pack':pack,'reportOnly':check_only}).encode(),capture_output=True,timeout=15)
        if process.returncode:
            raise ValueError('Workflow verification failed: '+validation_error(process))
        result=json.loads(process.stdout)
        if check_only:return result['report']
        if not result['report']['pass']:
            raise ValueError('Gameplay checks failed. Review the current report before exporting a verified workflow.')
        files={'index.html':(ROOT/'workflow-host.html').read_text(),'host.mjs':(ROOT/'workflow-host.mjs').read_text(),'component.mjs':result['module'],
               'game-adapter.mjs':(ROOT/'game-adapter.mjs').read_text(),'bindings.json':json.dumps(result['bindings'],indent=2),
               'quality-contract.mjs':(ROOT/'quality-contract.mjs').read_text(),'contract.json':json.dumps(data['contract'],indent=2),
               'verify.mjs':(ROOT/'verify-workflow.mjs').read_text(),'project.json':json.dumps(project,indent=2),
               'integrity.json':json.dumps({key:result['report'][key] for key in ['projectSHA256','componentSHA256','bindingsSHA256']},indent=2),
               'trace.json':json.dumps(result.get('trace',data['contract']['cases'][0]['trace']),indent=2),
               'provenance.json':json.dumps({'preparation':preparation,'contract':result['report'],'runtimeSchema':3,'bindingsVersion':1},indent=2),
               'README.txt':'SoundRig connected workflow. Serve with: python3 -m http.server 8780 --bind 127.0.0.1\nRun checks: node verify.mjs\nNo model/authoring server or npm install required. Exit0 passes;1 is a failed check;2 is invalid input/runtime or artifact mismatch.\nAfter changing sounds, recipe, mix or bindings in SoundRig, re-export the connected workflow; stale project/component combinations refuse verification. contract.json may be edited to tighten checks.\nUse game-adapter.mjs with explicit raw-state fields and named event hooks; no automatic engine understanding.\nThe adapter stream has its own mute/volume, not Phaser global settings. Pause/suspension invalidates capture.\nSee project.json/provenance.json and licenses/ for recordings and declared sources.\n',
               'licenses/impact-CC0.txt':(ROOT/'licenses/impact-CC0.txt').read_text(),'licenses/interface-CC0.txt':(ROOT/'licenses/interface-CC0.txt').read_text()}
        return write_package(files,'workflow',result['report'])
    finally:
        ADMISSION.release()

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import hashlib
import socket
import subprocess
import threading
import time
import urllib.request
import uuid
import re
from urllib.parse import urlsplit, unquote
from delivery import delivery_endpoint
from sound_review import review_endpoint
from revision_store import revision_endpoint,MAX_SNAPSHOT
from project_assets import MAX_BODY
from project_api import project_snapshot, project_endpoint, workflow_endpoint, build_project, atomic_text, ProjectBusy, validation_error

ROOT = Path(__file__).resolve().parent
MODEL = 'muse-glimmer:30b-mlx'
SLOT = threading.BoundedSemaphore(1)
REQUEST_SLOT = threading.BoundedSemaphore(1)
MODEL_ENABLED = True
COUNTS = {'compile': 0, 'patch': 0, 'upstream': 0}
VALIDATION_TIMEOUT = 15
WORKFLOW_TIMEOUT = 330
SCHEMA = '''You compile game audio behavior into bounded JSON data, never executable code. Reasoning strength: low.
If the request needs speech, new audio generation, music generation, assets outside this catalog, arbitrary code or unsupported capabilities, return ONLY {"unsupported":"clear reason"}.
Otherwise return JSON ONLY. Rig schema3:
{version:3,controls:[{id,min:0,max:1}],events:[eventName],master:0..0.8,layers:[layer]}.
Use EXACTLY the supplied control IDs and events. At most6 layers. This game needs role IDs footsteps,wind,land_thud,pickup_chime,hurt_buzz.
Sample layer fields ONLY: {id,type:"sample",gain:number|binding,pulseHz:number|binding,when:[condition],event:null|eventName,filter:null|{type:"lowpass"|"highpass",cutoff:number|binding},samples:[1..4 catalog IDs],rate:number|binding,variation:number}.
A sample event plays its whole short asset once. A continuous sample event=null retriggers at pulseHz (footsteps). Choose distinct pool IDs for no immediate repeats. rate.75..1.25, variation0..0.05, gain0..1, pulseHz0..12, filtercutoff60..10000Hz.
Noise/tone layer fields ONLY: {id,type:"noise"|"tone",wave:"sine"|"triangle"|"sawtooth",frequency:number|binding,gain:number|binding,pulseHz:number|binding,when:[condition],event:null|eventName,filter:null|{type:"lowpass"|"highpass",cutoff:number|binding},envelope:{attack:number,decay:number,release:number},pitchEnd:number}.
Tone/noise frequency30..4000Hz (noise ignores it), gain0..1, pulseHz0..12, attack.001..0.1s, decay.02..0.8s, release.005..0.3s,pitchEnd.25..4. Noise wind must use a lowpass filter.
binding={control:id,lo:number,hi:number} maps normalized0..1 linearly. condition={control:id,op:"above"|"below",threshold:0..1}. ALL conditions must hold, at most4 per layer.
Footsteps gain must map speed with lo0 and run only speed>.01,grounded>.5,alive>.5. Wind gain must map air with lo0 and run only air>.01,grounded<.5,alive>.5. Use noise for wind and sample layers for footsteps/land/pickup/hurt. Event layers have no continuous playback. Keep restrained volumes; master0.65 is a reasonable start. No undeclared/unsupported fields.'''
SCHEMA += '''\nEvery field shown for its layer type is REQUIRED, even if it does not affect that source. Every sample one-shot MUST include pulseHz:0. Every noise layer MUST include wave:"sine",frequency:200,pulseHz:0,pitchEnd:1, and envelope:{attack:0.003,decay:0.1,release:0.05}. Do not omit unused fields. These are strict parser requirements.'''


class Busy(Exception):
    pass


def model_request(system, prompt, timeout=150):
    if not MODEL_ENABLED:
        raise ConnectionError('Authoring is disabled for the offline playback test.')
    if not SLOT.acquire(blocking=False):
        raise Busy('A compilation is already running. Your current rig is unchanged.')
    try:
        COUNTS['upstream'] += 1
        began = time.monotonic()
        body = {'model': MODEL, 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}],
                'stream': False, 'options': {'temperature': 0, 'num_predict': 5000, 'num_ctx': 8192}, 'keep_alive': 0}
        request = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError('Model response exceeded its size limit.')
        result = json.loads(raw)
        final = result.get('message', {}).get('content', '').strip()
        clean = final.removeprefix('```json').removeprefix('```').removesuffix('```').strip()
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError:
            parsed = {'invalidModelJSON': clean}
        return parsed, {'model': MODEL, 'eval_count': result.get('eval_count'), 'done_reason': result.get('done_reason'), 'modelSeconds': round(time.monotonic()-began, 3)}
    finally:
        SLOT.release()


def checked_generation(system, prompt, request_data, kind):
    if not REQUEST_SLOT.acquire(blocking=False):
        raise Busy('Another authoring workflow is running. Your current rig is unchanged.')
    attempts = []
    run_id = uuid.uuid4().hex[:12]
    deadline = time.monotonic() + WORKFLOW_TIMEOUT
    try:
        snapshot = project_snapshot(request_data.get('projectDigest'))
        validation = {'pack':snapshot['pack'], 'clearMix':snapshot['project']['clearMix'],'quality':snapshot['project'].get('quality','classic'),'projectSnapshotSHA256':hashlib.sha256(json.dumps(snapshot['project'],sort_keys=True).encode()).hexdigest()} if snapshot else None
        baseline_contract = None
        if data_contract := request_data.get('contract'):
            current = request_data.get('rig') or json.loads((ROOT/'hybrid-rig.json').read_text())
            payload = {'project':{'rig':current,'clearMix':validation['clearMix'] if validation else False,'quality':validation['quality'] if validation else 'classic'},'pack':validation['pack'] if validation else {},'contract':data_contract,'reportOnly':True}
            preflight = subprocess.run(['node',str(ROOT/'workflow-cli.mjs')],input=json.dumps(payload).encode(),capture_output=True,timeout=VALIDATION_TIMEOUT)
            if preflight.returncode:
                raise ValueError('Invalid gameplay contract or current rig: '+validation_error(preflight))
            baseline_contract = json.loads(preflight.stdout)['report']
            prompt += '\nDEVELOPER GAMEPLAY CONTRACT (signal metrics, not listening):\n'+json.dumps({'expectations':[{'id':c['id'],'expect':c['expect']} for c in data_contract['cases']],'measuredCurrent':baseline_contract})
        elif 'contract' in request_data:
            raise ValueError('A nonempty gameplay contract is required when guards are enabled.')
        for attempt in range(2):
            journal_path = ROOT / 'evidence' / f'authoring-{run_id}-{attempt + 1}.json'
            journal = {'kind': kind, 'request': request_data, 'attempt': attempt + 1, 'stage': 'requesting model'}
            journal_path.write_text(json.dumps(journal, indent=2))
            try:
                remaining = deadline - time.monotonic() - VALIDATION_TIMEOUT
                if remaining <= 0:
                    raise TimeoutError('Authoring workflow deadline reached before another inference')
                result, info = model_request(system, prompt, timeout=min(150, remaining))
            except Exception as error:
                journal.update({'stage': 'model failed', 'error': str(error)[:500]})
                journal_path.write_text(json.dumps(journal, indent=2))
                raise
            fingerprint = hashlib.sha256(b''.join((ROOT / name).read_bytes() for name in ['core.mjs','checks.mjs','check-authoring.mjs','project-runtime.mjs','bundle.mjs','quality-contract.mjs','studio-dsp.mjs'])).hexdigest()
            journal.update({'stage': 'received; awaiting verification', 'output': result, 'modelInfo': info, 'validatorSHA256': fingerprint})
            if validation:journal['projectBankSHA256'] = hashlib.sha256(json.dumps(validation,sort_keys=True).encode()).hexdigest()
            journal_path.write_text(json.dumps(journal, indent=2))
            if isinstance(result, dict) and 'unsupported' in result:
                attempts.append({'output': result, 'verification': {'unsupported': True}})
                journal.update({'stage': 'unsupported', 'verification': {'unsupported': True}})
                journal_path.write_text(json.dumps(journal, indent=2))
                return result, {**info, 'attempts': attempts, 'verified': False}
            validation_started = time.monotonic()
            try:
                remaining = deadline - validation_started
                if remaining <= 0:
                    raise subprocess.TimeoutExpired('workflow', WORKFLOW_TIMEOUT)
                output = subprocess.run(['node', str(ROOT / 'check-authoring.mjs')],
                    input=json.dumps({'kind': kind, 'result': result, 'request': request_data, 'projectValidation':validation}).encode(),
                    capture_output=True, timeout=min(VALIDATION_TIMEOUT, remaining))
                checked = json.loads(output.stdout) if output.returncode == 0 else {'ok': False, 'error': 'Validation process failed', 'infrastructureError': True}
            except (subprocess.TimeoutExpired, OSError, json.JSONDecodeError) as error:
                checked = {'ok': False, 'error': 'Local verifier unavailable or exceeded its15second limit. Retry when local resources are available.', 'infrastructureError': True}
            checked['seconds'] = round(time.monotonic() - validation_started, 4)
            journal.update({'stage': 'verified' if checked['ok'] else 'verification failed', 'verification': {k:v for k,v in checked.items() if k != 'rig'}})
            journal_path.write_text(json.dumps(journal, indent=2))
            attempts.append({'output': result, 'verification': {k:v for k,v in checked.items() if k != 'rig'}})
            if checked['ok']:
                return result, {**info, 'attempts': attempts, 'verified': True, 'checks': checked['checks'],**({'contract':checked['contract'],'baselineContract':baseline_contract} if checked.get('contract') else {})}
            if checked.get('infrastructureError'):
                return result, {**info, 'attempts': attempts, 'verified': False, 'validationError': checked['error'], 'infrastructureError': True}
            prompt += '\nDETERMINISTIC CHECK FAILED: ' + checked.get('error', 'invalid data') + '\nRepair the JSON. Keep the confirmed interface and all locked layers. Do not explain.'
        return result, {**info, 'attempts': attempts, 'verified': False, 'validationError': checked.get('error')}
    finally:
        REQUEST_SLOT.release()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *_args):
        pass

    def send_head(self):
        decoded=unquote(urlsplit(self.path).path)
        parts=Path(decoded.lstrip('/')).parts
        if '..' in parts or '%' in decoded or '\\' in decoded:
            self.send_error(404);return None
        relative=Path(*parts) if parts else Path('index.html')
        path=ROOT/relative
        if path.is_dir():relative=relative/'index.html';path=ROOT/relative
        root_files={'index.html','studio.html','guide.html','404.html','site.css','studio.css','style.css','landing.mjs','app.mjs','recording-stage.mjs','cue-edit.mjs','core.mjs','checks.mjs','samples.mjs','player.mjs','worklet.mjs','exported.html','game.mjs','game-controls.mjs','studio-ux.mjs','revision-data.mjs','project-loader.mjs','game-adapter.mjs','quality-contract.mjs','integration-example.mjs','standalone-host.mjs','workflow-host.mjs','hybrid-rig.json','bindings.json','example-trace.json','synth-baseline.json','favicon.svg','README.md','THIRD_PARTY_NOTICES.md'}
        name=relative.as_posix();top=relative.parts[0]
        allowed=name in root_files or top in {'assets','vendor','licenses','fonts'} and path.suffix.lower() in {'.png','.webp','.svg','.jpg','.wav','.ogg','.json','.js','.mjs','.css','.woff2','.ttf','.txt','.md'}
        allowed=allowed or name in {'fixtures/workflow-release-contract.json','fixtures/workflow-example-project.json','fixtures/studio-example-project.json','fixtures/custom-pickup.wav','fixtures/custom-hurt.wav','evidence/latest-meta-rig.json'}
        if top=='exports':
            allowed=bool(len(relative.parts)==2 and (re.fullmatch(r'soundrig-(?:delivery|workflow|project)-[a-f0-9]{12}\.zip',relative.name) or relative.name=='current-component.mjs'))
            allowed=allowed or bool(len(relative.parts)>=3 and re.fullmatch(r'(?:delivery|workflow|project)-[a-f0-9]{12}',relative.parts[1]) and path.suffix.lower() in {'.html','.mjs','.js','.json','.wav','.txt','.md','.ttf'})
        current=ROOT
        for part in relative.parts:
            current=current/part
            if current.is_symlink():allowed=False
        if not allowed or not path.is_file() or not path.resolve().is_relative_to(ROOT.resolve()):
            self.send_error(404);return None
        return super().send_head()

    def send_error(self, code, message=None, explain=None):
        if code==404 and (ROOT/'404.html').is_file():
            data=(ROOT/'404.html').read_bytes();self.send_response(404)
            self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers()
            if self.command!='HEAD':self.wfile.write(data)
        else:super().send_error(code,message,explain)

    def reply(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except BrokenPipeError:
            pass

    def do_GET(self):
        if self.path == '/api/status':
            available = False
            try:
                with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=2) as response:
                    tags = json.load(response)
                available = any(x.get('name') == MODEL for x in tags.get('models', []))
            except Exception:
                pass
            self.reply(200, {'enabled': MODEL_ENABLED, 'modelAvailable': available, 'model': MODEL, 'calls': COUNTS.copy()})
        else:
            super().do_GET()

    def do_POST(self):
        global MODEL_ENABLED
        if self.path not in ['/api/compile', '/api/patch', '/api/model-mode', '/api/browser-evidence', '/api/export', '/api/project', '/api/project-export','/api/workflow-export','/api/workflow-check','/api/delivery','/api/godot-export','/api/review-sound','/api/revisions']:
            self.reply(404, {'error': 'Unknown endpoint'}); return
        if self.headers.get('Origin') not in (None, 'http://127.0.0.1:8772') or self.headers.get('X-SoundRig') != 'local-proof':
            self.reply(403, {'error': 'This endpoint is local to the SoundRig workbench.'}); return
        started = time.monotonic()
        try:
            length = int(self.headers.get('Content-Length', '0'))
            limit = MAX_SNAPSHOT+1024 if self.path=='/api/revisions' else MAX_BODY if self.path in ('/api/project','/api/project-export','/api/workflow-export','/api/workflow-check','/api/delivery','/api/godot-export') else 600000 if self.path=='/api/review-sound' else 196608 if self.path=='/api/export' else 65536
            if not 0 < length <= limit:
                raise ValueError(f'Request size must be between1 and{limit} bytes.')
            self.connection.settimeout(5)
            try:raw=self.rfile.read(length)
            except socket.timeout:
                self.close_connection=True;self.reply(408,{'error':'Request body timed out. Retry with the complete project.'});return
            if len(raw)!=length:raise ValueError('Request body is truncated.')
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError('Object request required.')
            if self.path=='/api/revisions':
                self.reply(200,revision_endpoint(data));return
            if self.path in ('/api/delivery','/api/godot-export'):
                self.reply(200,delivery_endpoint(data,target='godot' if self.path=='/api/godot-export' else 'phaser'));return
            if self.path=='/api/review-sound':
                self.reply(200,review_endpoint(data));return
            if self.path in ('/api/project','/api/project-export'):
                self.reply(200, project_endpoint(self.path,data)); return
            if self.path in ('/api/workflow-export','/api/workflow-check'):
                self.reply(200, workflow_endpoint(data,check_only=self.path=='/api/workflow-check'));return
            if self.path == '/api/model-mode':
                if type(data.get('enabled')) is not bool:
                    raise ValueError('A boolean enabled value is required.')
                MODEL_ENABLED = data['enabled']
                self.reply(200, {'enabled': MODEL_ENABLED, 'calls': COUNTS.copy()}); return
            if self.path == '/api/browser-evidence':
                (ROOT / 'evidence/browser-selfcheck.json').write_text(json.dumps(data, indent=2))
                self.reply(200, {'saved': True}); return
            if self.path == '/api/export':
                snapshot = project_snapshot(data.get('projectDigest'))
                project = {**snapshot['project'], 'rig':data.get('rig')} if snapshot else {'version':1,'name':'Component export','rig':data.get('rig'),'assets':{},'clearMix':False}
                result, _ = build_project(project,data.get('trace'))
                module=result['module'];digest=hashlib.sha256(module.encode()).hexdigest()[:12]
                atomic_text(ROOT/'exports/current-component.mjs',module)
                atomic_text(ROOT/'exports/current-rig.json',json.dumps(data['rig'],indent=2))
                atomic_text(ROOT/'exports/export-info.json',json.dumps({'sha256':digest,'projectDigest':data.get('projectDigest'),'tracePCMHash':result['tracePCMHash'],'authoringCallsAtExport':COUNTS.copy()}))
                self.reply(200,{'module':module,'digest':digest,'tracePCMHash':result['tracePCMHash'],'url':f'exports/current-component.mjs?v={digest}'}); return
            prompt = data.get('prompt')
            if not isinstance(prompt, str) or not 1 <= len(prompt) <= 4000:
                raise ValueError('Describe the behavior in1–4000 characters.')
            snapshot = project_snapshot(data.get('projectDigest'))
            if self.path == '/api/compile':
                manifest = json.loads((ROOT / 'bindings.json').read_text())
                system = SCHEMA
                catalog = json.loads((ROOT / 'assets/catalog.json').read_text())
                if snapshot:catalog.update(snapshot['pack'])
                catalog = {key: {'title':value['title'],'seconds':value['seconds']} for key,value in catalog.items()}
                user = 'GAME BINDINGS:\n' + json.dumps(manifest) + '\nCATALOG:\n' + json.dumps(catalog) + '\nSOUND INTENT:\n' + prompt
                result, info = checked_generation(system, user, data, 'compile')
                COUNTS['compile'] += 1; kind = 'compile'; response = {'rig': result, **info}
            else:
                rig, target, locks = data.get('rig'), data.get('layerId'), data.get('lockedIds', [])
                if not isinstance(rig, dict) or not isinstance(target, str) or not isinstance(locks, list):
                    raise ValueError('A current rig, target layer and locks are required.')
                if target in locks:
                    raise ValueError('The selected layer is locked.')
                system = SCHEMA + '\nFor this request return ONLY {"layerId": target, "changes": {changedFields}}. Do not return a complete rig. Keep locked layers untouched. Use complete nested objects for any changed filter/envelope/binding. Do not change id, type or event. Include only requested fields.'
                catalog = json.loads((ROOT / 'assets/catalog.json').read_text())
                if snapshot:catalog.update(snapshot['pack'])
                user = json.dumps({'rig': rig, 'target': target, 'lockedLayers': locks, 'instruction': prompt, 'catalog': {k:v['title'] for k,v in catalog.items()}})
                result, info = checked_generation(system, user, data, 'patch')
                COUNTS['patch'] += 1; kind = 'patch'; response = {'patch': result, **info}
            response['seconds'] = round(time.monotonic() - started, 3)
            record = {'request': data, 'response': response, 'scope': 'Actual local model output; not yet trusted or accepted by the runtime.'}
            name = f'{kind}-{uuid.uuid4().hex[:12]}.json'
            (ROOT / 'evidence' / name).write_text(json.dumps(record, indent=2))
            response['record'] = name
            if isinstance(result,dict) and 'unsupported' in result:
                self.reply(422, {'error': 'Unsupported request: ' + str(result['unsupported'])[:500], 'record':name, 'seconds':response['seconds'], 'attemptCount':len(info['attempts'])})
            elif not info['verified']:
                self.reply(503 if info.get('infrastructureError') else 422, {'error': f'Verification failed after {len(info["attempts"])} attempt(s): ' + str(info.get('validationError')), 'record':name, 'seconds':response['seconds'], 'attemptCount':len(info['attempts'])})
            else:
                self.reply(200, response)
        except (Busy, ProjectBusy) as error:
            self.reply(429, {'error': str(error)})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': 'Revision verification timed out. Current work is unchanged. Retry when this computer is less busy.' if self.path=='/api/revisions' else 'Local verification timed out. Your current rig is retained; retry when this computer is less busy.'})
        except (socket.timeout, TimeoutError):
            self.reply(504, {'error': 'Local Meta inference timed out. Keep playing with the current rig or load the baseline.'})
        except (ValueError, KeyError, RecursionError) as error:
            self.reply(400, {'error': str(error)})
        except Exception as error:
            self.reply(503, {'error': 'Local Meta authoring is unavailable. Your current rig and exports still work.', 'reason': str(error)[:180]})


if __name__ == '__main__':
    print('SoundRig hybrid build: http://127.0.0.1:8772', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8772), Handler).serve_forever()

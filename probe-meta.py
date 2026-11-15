"""Frozen fresh local-model cases. Preserve failures; no model grades its own output."""
from pathlib import Path
import argparse, json, subprocess, time, urllib.request, urllib.error
ROOT=Path(__file__).resolve().parent
rig=json.loads((ROOT/'hybrid-rig.json').read_text())
cases=[
 {'id':'concrete-kit','kind':'compile','prompt':'Build this platformer a balanced concrete sound kit. Use the two concrete footstep variants while running grounded and alive; filtered wind only airborne and alive, soft heavy landings, a pickup confirmation and a hurt alert. Preserve silence at rest and after death. Use the existing catalog.','material':'concrete'},
 {'id':'wood-kit','kind':'compile','prompt':'Create an intimate wooden-toy platformer kit using both wood footstep variants, soft landing variations, confirmation pickup and short hurt alert. Wind should follow vertical air motion and stop grounded or dead. Footsteps stop at rest, while airborne and after death. Use only the supplied catalog.','material':'wood'},
 {'id':'wind-only','kind':'patch','target':'wind','prompt':'Lower only the wind lowpass cutoff to a fixed650Hz. Keep its air gain mapping and all conditions. Preserve all locked layers.','cutoff':650},
 {'id':'wood-only','kind':'patch','target':'footsteps','prompt':'Change only the footstep sample pool to step_wood_a and step_wood_b. Keep its gain, cadence, rate, variation, filter and conditions exactly. Preserve all locked layers.','material':'wood'},
 {'id':'unsupported-speech','kind':'compile','prompt':'Generate new spoken dialogue: a wizard must say Welcome brave traveler in a realistic voice. I need newly generated speech, not a substitute alert sound.','unsupported':True},
 {'id':'unsupported-score','kind':'compile','prompt':'Generate a new60second orchestral music score from scratch, with strings and a sung choir. Do not substitute existing sample IDs.','unsupported':True},
]
parser=argparse.ArgumentParser();parser.add_argument('--ids',nargs='*');parser.add_argument('--output',default='meta-cases-results.json');args=parser.parse_args()
if args.ids:
    if set(args.ids)-{c['id'] for c in cases}:parser.error('Unknown frozen case ID')
    cases=[c for c in cases if c['id'] in args.ids]
frozen=ROOT/'evidence/frozen-meta-cases.json'
if not frozen.exists():frozen.write_text(json.dumps({'cases':cases,'expected':'Game schema/interface, deterministic behavior checks, example-trace headroom; named material/cutoff checks and declared unsupported requests. No human-quality success criterion.'},indent=2))
results=[]
for case in cases:
    data={'prompt':case['prompt']}
    if case['kind']=='patch':data.update({'rig':rig,'layerId':case['target'],'lockedIds':[l['id'] for l in rig['layers'] if l['id']!=case['target']]})
    started=time.monotonic()
    request=urllib.request.Request('http://127.0.0.1:8771/api/'+case['kind'],data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-SoundRig':'local-proof'})
    try:
        with urllib.request.urlopen(request,timeout=360) as response:code=response.status;body=json.load(response)
    except urllib.error.HTTPError as error:code=error.code;body=json.load(error)
    except Exception as error:code=0;body={'error':str(error)}
    passed=False;errors=[]
    if case.get('unsupported'):passed=code==422 and body.get('error','').startswith('Unsupported request:')
    elif code==200:
        checked=json.loads(subprocess.run(['node',str(ROOT/'check-authoring.mjs')],input=json.dumps({'kind':case['kind'],'result':body.get('rig',body.get('patch')),'request':data}).encode(),capture_output=True,check=True).stdout)
        passed=checked['ok']
        if passed:
            accepted=checked['rig'];foot=next(l for l in accepted['layers'] if l['id']=='footsteps')
            if case.get('material'):passed=all('step_'+case['material']+'_' in s for s in foot.get('samples',[])) and len(foot.get('samples',[]))==2
            if 'cutoff' in case:passed=next(l for l in accepted['layers'] if l['id']=='wind')['filter']['cutoff']==case['cutoff']
            if case['kind']=='patch' and case['target']=='footsteps':
                before=next(l for l in rig['layers'] if l['id']=='footsteps');passed=passed and all(foot[k]==v for k,v in before.items() if k!='samples')
            if passed and case['kind']=='compile':(ROOT/'evidence/latest-meta-rig.json').write_text(json.dumps(body,indent=2))
        else:errors.append(checked.get('error'))
    result={'id':case['id'],'pass':passed,'httpStatus':code,'seconds':round(time.monotonic()-started,3),'record':body.get('record'),'attempts':body.get('attemptCount',len(body.get('attempts',[]))),'errors':errors,'response':body}
    results.append(result)
    (ROOT/'evidence'/Path(args.output).name).write_text(json.dumps({'completed':len(results),'total':len(cases),'passed':sum(r['pass'] for r in results),'results':results,'scope':'Frozen local cases; not a population success rate or human preference study.'},indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='response'}),flush=True)

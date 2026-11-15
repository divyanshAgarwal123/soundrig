import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {spawnSync} from 'node:child_process';
import {editCue} from './cue-edit.mjs';import {projectModule} from './project-runtime.mjs';import {checkContract} from './quality-contract.mjs';import {validateTrace,stableJSON} from './core.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url))),project=read('fixtures/studio-browser-project.json');
const prepared=spawnSync('python3',['-c','import sys,json;from project_assets import prepare_project;p=json.load(sys.stdin);print(json.dumps(prepare_project(p)[0]))'],{cwd:new URL('.',import.meta.url),input:JSON.stringify(project),encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
const {imported:runtime}=await projectModule(project.rig,JSON.parse(prepared.stdout),project.clearMix,project.quality),contract=read('fixtures/workflow-release-contract.json');
const before=stableJSON(project.rig),edited=editCue(project.rig,'pickup_chime',.24,1.01);
assert.equal(stableJSON(project.rig),before);for(const layer of project.rig.layers.filter(l=>l.id!=='pickup_chime'))assert.equal(stableJSON(edited.layers.find(l=>l.id===layer.id)),stableJSON(layer));
for(const args of [['wind',.2,1],['footsteps',.2,1],['pickup_chime',NaN,1],['pickup_chime',.2,1.26]])assert.throws(()=>editCue(project.rig,...args));
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};$('mix-cue').value='pickup_chime';$('mix-gain').value='.24';$('mix-rate').value='1.01';
const app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8'),code=app.slice(app.indexOf('async function applyCueEdit('),app.indexOf('async function exportProject('));
const context=vm.createContext({$,structuredClone,stableJSON,editCue,checkContract,validateTrace,runtime,project,contract,paintContract(){},saveEvidence(){},lockEditing(){},performance});
vm.runInContext(`let busy=false,rig=structuredClone(project.rig),projectRuntime=runtime,projectDigest='project',manualUndo=null,projectLoader={attempts:1},contractReport=null,evidence={},enabled=true;
 function projectData(){return {...structuredClone(project),rig:structuredClone(rig)};}
 function guardContract(){return enabled?{contract}:{};}
 function install(next){rig=next;manualUndo=null;}
 ${code}`,context);
await vm.runInContext('applyCueEdit()',context);assert.equal(vm.runInContext('rig.layers.find(l=>l.id==="pickup_chime").gain',context),.24);assert(vm.runInContext('manualUndo&&contractReport.pass',context));assert.equal(vm.runInContext('projectRuntime',context),runtime);
await vm.runInContext('applyCueEdit(true)',context);assert.equal(vm.runInContext('stableJSON(rig)',context),before);assert.equal(vm.runInContext('manualUndo',context),null);
$('mix-gain').value='.24';await vm.runInContext('applyCueEdit()',context);const undo=vm.runInContext('manualUndo',context),current=vm.runInContext('stableJSON(rig)',context);
$('mix-gain').value='.00001';await vm.runInContext('applyCueEdit()',context);assert.equal(vm.runInContext('stableJSON(rig)',context),current);assert.equal(vm.runInContext('manualUndo',context),undo);assert.match($('mix-status').textContent,/rejected/);
vm.runInContext('projectDigest="another-project";',context);await vm.runInContext('applyCueEdit(true)',context);assert.equal(vm.runInContext('stableJSON(rig)',context),current);assert.match($('mix-status').textContent,/another sound revision/);
vm.runInContext('enabled=false;projectDigest="project";',context);
const began=performance.now();for(let i=0;i<40;i++){$('mix-gain').value=String(.2+i*.001);await vm.runInContext('applyCueEdit()',context);}
assert.equal(vm.runInContext('projectLoader.attempts',context),1);assert.equal(vm.runInContext('projectRuntime',context),runtime);assert.equal(runtime.SAMPLE_PACK,runtime.SAMPLE_PACK);
const report={pass:true,cases:6,uncheckedFortyEditsMs:performance.now()-began,runtimeImportsBefore:1,runtimeImportsAfter:1,scope:'Actual edit planner and app apply/undo function, actual project renderer and contracts, explicit DOM/network fixtures. Browser behavior checked separately; timing is not a human task benchmark.'};
fs.writeFileSync(new URL('evidence/practical-cue-edit-tests.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

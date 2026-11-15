import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {digest} from './quality-contract.mjs';
const project=JSON.parse(fs.readFileSync(new URL('fixtures/studio-browser-project.json',import.meta.url))),app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8'),code=app.slice(app.indexOf('function activationUI('),app.indexOf('async function importSound(')),lock=app.slice(app.indexOf('function lockEditing('),app.indexOf('async function author('));
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{disabled:false,value:'',textContent:'',replaceChildren(){},append(){}});return elements.get(id);};$('volume').value='60';
let release,replacements=0,guardPass=true;
const oldRuntime={},oldPlayer={stop(){},setMonitorGain(){}};
const context=vm.createContext({$,game:null,structuredClone,digest,project,oldRuntime,oldPlayer,checkedRig:r=>r,bindings:()=>({}),state:{},DEFAULT_BINDINGS:{},failCommit:false,stopPreview(){},clearRecordingReview(){},stopAudio(){},paintContract(){},refreshCutoff(){},refreshMaterial(){},saveEvidence(){},document:{createElement:()=>({})},
 api:async(path,data)=>path==='/api/project'?new Promise(r=>release=()=>r({module:'new-module',digest:'new-project',report:{importedSlots:[],exportBytes:100,assets:{}}})):({pass:guardPass,projectSHA256:await digest(data.project),cases:[{failures:guardPass?[]:['pickup too quiet']}]}),
 });
vm.runInContext(`let workspaceEpoch=0,trace={},traceProvenance={},comparisonCache=null,busy=false,muted=false,manualUndo=null,rig=structuredClone(project.rig),projectRuntime=oldRuntime,player=oldPlayer,projectDigest='old-project',gameplayContract={cases:[{}]},contractReport=null,evidence={};
let projectLoader={attempts:1,replace:async(source,rig,controls,options)=>{recordReplace();const next={runtime:{id:'new-runtime'},player:{setMonitorGain(){}}};try{options.commit(next);}catch(error){options.rollback();throw error;}return next;}};
function install(r){rig=r;$('material').value=r.layers.find(x=>x.id==='footsteps').samples[0].includes('wood')?'wood':'concrete';if(failCommit)throw Error('fixture commit failure');}
${lock}\n${code}`,context);context.recordReplace=()=>replacements++;
const pending=vm.runInContext('activateProject(structuredClone(project),{version:1})',context);assert.equal($('recording-cancel').disabled,true);release();await pending;assert.equal(replacements,1);assert.equal($('recording-cancel').disabled,false);
const runtime=vm.runInContext('projectRuntime',context),current=vm.runInContext('player',context);guardPass=false;const rejected=vm.runInContext('activateProject(structuredClone(project),{version:1})',context);release();await assert.rejects(rejected,/saved checks/);assert.equal(replacements,1);assert.equal(vm.runInContext('projectRuntime',context),runtime);assert.equal(vm.runInContext('player',context),current);assert.equal($('recording-cancel').disabled,false);
fs.writeFileSync(new URL('evidence/practical-recording-apply-tests.json',import.meta.url),JSON.stringify({pass:true,cases:2,scope:'Actual activation and lock functions with delayed preparation: discard disabled during commit; failed saved checks preserve current runtime/player and do not replace the bank. Network/DOM fixture; browser path checked separately.'},null,2));console.log('Recording activation:2 controls passed');

$('quality').value='classic';$('clear-mix').checked=false;
const rejectedSettings=vm.runInContext('activateProject(structuredClone(project),{version:1})',context);release();await assert.rejects(rejectedSettings,/saved checks/);
assert.equal($('quality').value,project.quality??'classic');assert.equal($('clear-mix').checked,project.clearMix);
guardPass=true;context.failCommit=true;
const oldMaterial=$('material').value,beforeRig=vm.runInContext('rig',context),beforeProject=vm.runInContext('project',context);
const failedCommit=vm.runInContext("activateProject({...structuredClone(project),rig:{...structuredClone(project.rig),layers:project.rig.layers.map(l=>l.id==='footsteps'?{...l,samples:['step_concrete_a','step_concrete_b']}:l)}})",context);release();await assert.rejects(failedCommit,/commit failure/);
assert.equal($('material').value,oldMaterial);assert.equal(vm.runInContext('rig',context),beforeRig);assert.equal(vm.runInContext('project',context),beforeProject);assert.equal(vm.runInContext('player',context),current);
console.log('Activation rollback: rejected settings and material restored');

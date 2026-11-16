import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as runtime from './core.mjs';
import {checkContract,validateContract,digest} from './quality-contract.mjs';

// Execute the production handlers with DOM/network fixtures and real PCM checks.
const app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8');
const rig=JSON.parse(fs.readFileSync(new URL('hybrid-rig.json',import.meta.url)));
const contract=JSON.parse(fs.readFileSync(new URL('fixtures/workflow-release-contract.json',import.meta.url)));
const project={rig,assets:{},clearMix:false,quality:'classic',name:'Status regression'};
const node=()=>({textContent:'',value:'',dataset:{},children:[],replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}});
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
let mode='ok',rejectRestore=false,recoveries=0;
const snapshot={project,contract,protection:false};
const context=vm.createContext({$,JSON,TextEncoder,structuredClone,checkContract,validateContract,digest,validateTrace:runtime.validateTrace,document:{createElement:node},DEFAULT_BINDINGS:{},saveEvidence(){},lockEditing(){},refreshRevisions:async()=>{},revisionSnapshot:()=>snapshot,validateSnapshot:x=>x,
 api:async(path,data)=>{
  if(path==='/api/revisions')return data.action==='load'?{snapshot}:{revisions:[],maxCount:24,maxBytes:48*1048576,usedBytes:0};
  if(mode==='network')throw Error('Network fixture unavailable');
  const report=await checkContract(runtime,data.project.rig,data.contract);
  return {...report,projectSHA256:mode==='identity'?'wrong-project':await digest(data.project)};
 },
 activateProject:async()=>{
  if(rejectRestore)throw Error('Candidate rejected by saved checks');
  recoveries++;vm.runInContext('contractReport=null;paintContract();',context);
  $('workflow-status').textContent='UNCHECKED · Revision restored. Run saved checks again.';
  return {};
 },
});
vm.runInContext(`let busy=false,workspaceEpoch=0,selectedRevision={id:'fixture',label:'Named kit'},gameplayContract=${JSON.stringify(contract)},rig=${JSON.stringify(rig)},projectRuntime=runtime,contractReport=null,evidence={};
function projectData(){return project;}
${app.slice(app.indexOf('function invalidateContract('),app.indexOf('async function exportWorkflow('))}
${app.slice(app.indexOf('async function restoreRevision('),app.indexOf('function setupRevisions('))}
`,Object.assign(context,{runtime,project}));
$('workflow-json').value=JSON.stringify(contract);
await vm.runInContext('restoreRevision()',context);
assert.equal(recoveries,1);
assert.match($('workflow-status').textContent,/UNCHECKED/);
await vm.runInContext('runContract()',context);
assert.match($('workflow-status').textContent,/^PASS/);
assert.doesNotMatch($('revision-status').textContent,/UNCHECKED/i,'a completed check must not contradict the restore notice');
assert.match($('revision-status').textContent,/recovery checkpoint/);
const labels=()=>$('workflow-results').children.map(row=>row.children[0].textContent);
assert(labels().every(text=>text.startsWith('PASS')));
vm.runInContext('invalidateContract()',context);
assert.equal(vm.runInContext('contractReport',context),null);
assert(labels().every(text=>text.startsWith('Unchecked')),'editing must clear old PASS rows');
for(const failure of ['network','identity','invalid-json']){
 mode='ok';$('workflow-json').value=JSON.stringify(contract);
 await vm.runInContext('runContract()',context);
 assert.match($('workflow-status').textContent,/^PASS/);
 mode=failure;if(failure==='invalid-json')$('workflow-json').value='{';
 await vm.runInContext('runContract()',context);
 assert(!/^PASS/.test($('workflow-status').textContent));
 assert.equal(vm.runInContext('contractReport',context),null,failure+' retained an old successful report');
 assert(labels().every(text=>text.startsWith('Unchecked')),failure+' retained old PASS rows');
}
mode='ok';const impossible=structuredClone(contract);impossible.cases[0].expect.maxPreLimitPeak=0;
$('workflow-json').value=JSON.stringify(impossible);await vm.runInContext('runContract()',context);
assert.match($('workflow-status').textContent,/^FAIL/);
assert(labels().some(text=>text.startsWith('FAIL')));
rejectRestore=true;vm.runInContext("selectedRevision={id:'fixture',label:'Rejected kit'}",context);
await vm.runInContext('restoreRevision()',context);
assert.equal(recoveries,1);assert.match($('revision-status').textContent,/Current project retained/);
const report={pass:true,cases:8,scope:'Production restore/check/invalidation handlers, real deterministic PCM checks, explicit DOM/network/activation fixtures. Browser and recovery atomicity are verified separately.'};
fs.writeFileSync(new URL('evidence/revision-status-tests.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ProjectLoader} from './project-loader.mjs';
import {validateSnapshot,snapshotChanges} from './revision-data.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url)));
const snapshot={version:1,project:read('fixtures/studio-example-project.json'),trace:read('example-trace.json'),traceProvenance:{kind:'synthetic',source:'Revision test'},contract:read('fixtures/workflow-release-contract.json'),protection:true};
assert.deepEqual(validateSnapshot(snapshot),snapshot);
for(const edit of [s=>s.version=9,s=>s.protection='true',s=>s.traceProvenance.kind='bad',s=>s.contract=null,s=>s.trace.commands[0].atMs=-1,s=>s.report={pass:true}]){const bad=structuredClone(snapshot);edit(bad);assert.throws(()=>validateSnapshot(bad));}
const changed=structuredClone(snapshot);changed.project.name='Another';changed.project.rig.master=.4;assert(snapshotChanges(snapshot,changed).some(x=>x[0]==='Master level'));
const player=()=>({active:true,disposed:0,stop(){this.active=false;},async dispose(){this.disposed++;this.active=false;},setMonitorGain(){}});
let candidates=[];
const runtime={SoundRigPlayer:class{constructor(){Object.assign(this,player());candidates.push(this);}async start(){}async measureControl(){}},createPlayer:()=>({processorSource:'fixture'})};
for(const phase of ['backup','commit']){
 const old=player(),loader=new ProjectLoader({},old,async()=>runtime),globals={project:'old',checks:'old',trace:'old'};let rollback=false;
 await assert.rejects(loader.replace('',{}, {},{beforeCommit(){if(phase==='backup')throw Error('quota/disk fixture');},commit(){globals.project='new';globals.trace='new';throw Error('metadata fixture');},rollback(){Object.assign(globals,{project:'old',checks:'old',trace:'old'});rollback=true;}}));
 assert.equal(loader.active.player,old);assert.equal(old.active,true);assert.equal(old.disposed,0);assert.equal(candidates.at(-1).disposed,1);assert.equal(globals.project,'old');assert.equal(rollback,phase==='commit');
}
const old=player();old.stop=()=>{throw Error('cleanup fixture');};old.dispose=async()=>{throw Error('dispose fixture');};
const loader=new ProjectLoader({},old,async()=>runtime);let saved=false,committed=false;
const active=await loader.replace('',{}, {},{beforeCommit(){saved=true;},commit(){assert(saved);assert.equal(old.active,true);committed=true;}});assert(committed);assert.equal(loader.active,active);assert.equal(active.cleanupWarning,'dispose fixture');
const app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8');
for(const id of ['project-open','workflow-open','example-trace','baseline']){
 let resolve,mutations=0;const pending=new Promise(r=>resolve=r),nodes=new Map();
 const $=name=>nodes.get(name)??nodes.set(name,{value:'',files:[{size:10,text:()=>pending}]}).get(name);
 const context=vm.createContext({$,json:()=>pending,JSON,activateProject(){mutations++;},setContract(){mutations++;},installTrace(){mutations++;},install(){mutations++;},status(){},download(){}});
 vm.runInContext('let busy=false,workspaceEpoch=0;',context);
 let line=app.split('\n').find(x=>x.includes("$('"+id+"')."+(['example-trace','baseline'].includes(id)?'onclick':'onchange')+(id==='baseline'?' = async':'=async')));
 if(id==='example-trace')line=line.slice(line.indexOf("$('example-trace').onclick"));
 vm.runInContext(line,context);const work=$ (id)[['example-trace','baseline'].includes(id)?'onclick':'onchange']();
 vm.runInContext('workspaceEpoch++;',context);resolve(id==='example-trace'?snapshot.trace:JSON.stringify(id==='project-open'?snapshot.project:snapshot.contract));await work;
 assert.equal(mutations,0,id+' stale read mutated current work');assert.equal(vm.runInContext('busy',context),false);
}
const report={pass:true,cases:14,scope:'Snapshot rejection/diffs, real ProjectLoader backup/commit failures preserving original active player, exact-once candidate disposal, successful commit before cleanup and cleanup warnings. Fake audio objects; browser workflow separate.'};
fs.writeFileSync(new URL('evidence/revision-activation-tests.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

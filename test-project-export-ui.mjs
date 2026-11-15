import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
const app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8');
const code=app.slice(app.indexOf('async function exportComponent()'),app.indexOf('async function recordWav()'));
const pcm=Float32Array.from([0,.1,-.2,0]),hash=createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex');
let calls=0,downloads=0,urlCalls=0,release,statuses=[],locks=[];
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
let responseHash=hash,delayed=false;
const context=vm.createContext({$,structuredClone,crypto:webcrypto,URL:{createObjectURL(){urlCalls++;throw Error('No verification module import allowed');}},
 api:async()=>{calls++;if(delayed)await new Promise(resolve=>release=resolve);return{module:'trusted fixed runtime fixture',digest:'012345abcdef',tracePCMHash:responseHash};},
 download(){downloads++;},saveEvidence(){},status:(...x)=>statuses.push(x),lockEditing:x=>locks.push(x),console});
context.pcm=pcm;
vm.runInContext('let busy=false,rig={version:3},trace={version:1},projectDigest="fixture",projectLoader={attempts:8},projectRuntime={renderTrace:()=>({pcm})},evidence={};'+code,context);
for(let i=0;i<10;i++)await vm.runInContext('exportComponent()',context);
assert.equal(downloads,10);assert.equal(urlCalls,0);assert.equal(vm.runInContext('projectLoader.attempts',context),8);
delayed=true;const pending=vm.runInContext('exportComponent()',context),before=calls;
assert.equal(vm.runInContext('busy',context),true);await vm.runInContext('exportComponent()',context);assert.equal(calls,before);
// Snapshot must be retained even if a caller bypassed the disabled UI controls.
vm.runInContext('projectRuntime={renderTrace:()=>{throw Error("wrong current renderer")}};rig={different:true};trace={different:true};',context);
release();await pending;assert.equal(downloads,11);assert.equal(vm.runInContext('busy',context),false);assert.equal(locks.at(-1),false);
delayed=false;responseHash='mismatch';vm.runInContext('projectRuntime={renderTrace:()=>({pcm})};',context);await vm.runInContext('exportComponent()',context);
assert.equal(downloads,11);assert.match(statuses.at(-1)[0],/mismatch/);assert.equal(vm.runInContext('busy',context),false);
const report={pass:true,cases:3,checks:['10 exports at the8-import cap do not import a browser runtime','busy admission and renderer/rig/trace snapshots survive in-flight changes','hash mismatch creates no download and unlocks editing'],scope:'Actual app export function in Node vm with explicit network/Web API fixtures. Browser hash path is tested separately.'};
fs.writeFileSync(new URL('evidence/project-export-ui-test.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

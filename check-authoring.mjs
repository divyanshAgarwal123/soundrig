import fs from 'node:fs';
import {assertGameRig,gameChecks} from './checks.mjs';
import {applyPatch,renderTrace} from './core.mjs';
import {projectModule} from './project-runtime.mjs';
import {checkContract,digest} from './quality-contract.mjs';
const chunks=[];for await(const chunk of process.stdin) chunks.push(chunk);
try {
  const bytes=Buffer.concat(chunks);if(bytes.length>4194304)throw Error('Authoring result too large');
  const data=JSON.parse(bytes),manifest=JSON.parse(fs.readFileSync(new URL('bindings.json',import.meta.url)));
  let rig;
  if(data.kind==='patch'){
    if(!data.result||typeof data.result!=='object'||Array.isArray(data.result))throw Error('A patch object is required, not null or another JSON value');
    if(data.result.layerId!==data.request.layerId)throw Error('Patch addresses another layer');
    rig=applyPatch(data.request.rig,data.result,data.request.lockedIds);
  }else rig=data.result;
  rig=assertGameRig(rig);
  const names=x=>[...x].sort().join('|');
  if(names(rig.controls.map(c=>c.id))!==names(manifest.controls.map(c=>c.id))||names(rig.events)!==names(manifest.events.map(e=>e.id)))throw Error('Game interface mismatch');
  if(rig.version!==3)throw Error('Hybrid rig schema3 required');
  if(!rig.layers.some(l=>l.id==='footsteps'&&l.type==='sample'))throw Error('Use catalog samples for footsteps');
  const trace=JSON.parse(fs.readFileSync(new URL('example-trace.json',import.meta.url)));
  const artifact=(data.projectValidation||data.request.contract)?await projectModule(rig,data.projectValidation?.pack??{},data.projectValidation?.clearMix??false,data.projectValidation?.quality):null;
  const renderer=artifact?.imported??{renderTrace};
  const signal=renderer.renderTrace(rig,trace).summary;
  if(signal.peak<1e-5)throw Error('The example gameplay trace is silent');
  if(signal.saturatedSamples)throw Error('The example gameplay trace overloads the mix');
  const contract=data.request.contract?await checkContract(renderer,rig,data.request.contract):null;
  if(contract){contract.componentSHA256=await digest(artifact.module);contract.projectSnapshotSHA256=data.projectValidation?.projectSnapshotSHA256??await digest({version:1,name:'Default sound bank',rig:data.request.rig??rig,assets:{},clearMix:false});}
  if(contract&&!contract.pass){console.log(JSON.stringify({ok:false,error:'Gameplay contract failed: '+[...contract.cases.flatMap(c=>c.failures.map(f=>c.id+': '+f)),...contract.missingEvents.map(e=>'Missing coverage: '+e)].slice(0,8).join('; '),contract}));}
  else console.log(JSON.stringify({ok:true,checks:gameChecks(rig),signal,rig,...(contract?{contract}:{})}));
}catch(error){console.log(JSON.stringify({ok:false,error:error.message,...(error.code||error instanceof TypeError||error instanceof ReferenceError||error instanceof SyntaxError?{infrastructureError:true}:{})}));}

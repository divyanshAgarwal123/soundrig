import fs from 'node:fs';
import assert from 'node:assert/strict';
import {projectModule} from './project-runtime.mjs';
import {ProjectLoader} from './project-loader.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url)));
const {project,pack}=read('evidence/project-prepared.json'),fixture=read('example-trace.json'),results=[];
const test=async(name,fn)=>{await fn();results.push({name,pass:true});};
const base=await import('./fixtures/frozen-baseline-component.mjs');
const plain=await projectModule(project.rig,{},false),off=await projectModule(project.rig,pack,false),on=await projectModule(project.rig,pack,true);
const before=off.imported.renderTrace(project.rig,fixture).pcm,after=on.imported.renderTrace(project.rig,fixture).pcm;
await test('default mix and default bank preserve frozen baseline PCM',()=>assert.deepEqual(plain.imported.renderTrace(base.preset,fixture).pcm,base.renderTrace(base.preset,fixture).pcm));
await test('imported48k assets stay isolated from default module and preserve source metadata',()=>{
 assert.equal(on.imported.getSample('pickup_confirm').sampleRate,48000);assert.equal(plain.imported.getSample('pickup_confirm').sampleRate,24000);
 assert.equal(on.imported.getSample('pickup_confirm').sourceSHA256,pack.pickup_confirm.sourceSHA256);assert.notDeepEqual(before,plain.imported.renderTrace(project.rig,fixture).pcm);
});
await test('metadata containing export text and HTML survives both bundled realms',async()=>{
 const hostile={...pack,pickup_confirm:{...pack.pickup_confirm,title:'"export <script>測試.wav',licenseNote:'CC0 export </script> "quoted"'}};
 const {module,imported}=await projectModule(project.rig,hostile,true);
 assert.equal(imported.SAMPLE_PACK.pickup_confirm.title,hostile.pickup_confirm.title);assert(module.includes('export <script>'));
 assert(imported.createPlayer().processorSource.includes('export <script>'));
 globalThis.sampleRate=48000;globalThis.currentFrame=0;let C;globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){}};}};globalThis.registerProcessor=(_,c)=>C=c;
 await import('data:text/javascript;base64,'+Buffer.from(imported.createPlayer().processorSource).toString('base64'));
 const d=new C({processorOptions:{rig:project.rig,controls:fixture.initial,seed:17}});d.process([],[[new Float32Array(128)]]);
});
const air={speed:0,air:1,grounded:0,alive:1};
const cueTrace={version:1,durationMs:3000,initial:air,commands:[{atMs:1000,type:'event',event:'pickup',intensity:1}]};
const eventRig={...project.rig,layers:project.rig.layers.filter(l=>l.event!==null)};
const cue=off.imported.renderTrace(eventRig,cueTrace).pcm;
const pOff=off.imported.renderTrace(project.rig,cueTrace).pcm,pOn=on.imported.renderTrace(project.rig,cueTrace).pcm;
const pre=x=>Math.atanh(Math.max(-.9999999,Math.min(.9999999,x/.8)));
const bg=(pcm,start,end)=>{let square=0;for(let i=start;i<end;i++){const v=pre(pcm[i])-pre(cue[i]);square+=v*v;}return Math.sqrt(square/(end-start));};
const start=51840,end=56640,duckDB=20*Math.log10(bg(pOn,start,end)/bg(pOff,start,end));
await test('cue focus lowers background≥9dB while event-only PCM stays exact',()=>{
 assert(duckDB<-9,duckDB);assert.deepEqual(on.imported.renderTrace(eventRig,cueTrace).pcm,cue);
 const recovery=bg(pOn,115200,124800)/bg(pOff,115200,124800);assert(Math.abs(recovery-1)<.002,recovery);
});
await test('zero-intensity cues do not duck and partition sizes remain exact',()=>{
 const silentCue={...cueTrace,commands:[{atMs:1000,type:'event',event:'pickup',intensity:0}]};
 assert.deepEqual(on.imported.renderTrace(project.rig,silentCue).pcm,off.imported.renderTrace(project.rig,silentCue).pcm);
 for(const blockSize of [63,127,509])assert.deepEqual(on.imported.renderTrace(project.rig,fixture,{blockSize}).pcm,after);
});
await test('actual exported AudioWorklet reproduces project trace at44.1/48/96k',async()=>{
 let C;globalThis.AudioWorkletProcessor=class{constructor(){this.port={sent:[],postMessage(m){this.sent.push(m);}};}};globalThis.registerProcessor=(_,c)=>C=c;
 await import('data:text/javascript;base64,'+Buffer.from(on.imported.createPlayer().processorSource).toString('base64'));
 for(const rate of [44100,48000,96000]){
  globalThis.sampleRate=rate;globalThis.currentFrame=0;const p=new C({processorOptions:{rig:project.rig,controls:fixture.initial,seed:17}});
  p.port.onmessage({data:{type:'trace',trace:fixture,seq:7}});const expected=on.imported.renderTrace(project.rig,fixture,{sampleRate:rate}).pcm;
  const output=new Float32Array(Math.ceil(expected.length/128)*128);for(let i=0;i<output.length;i+=128){globalThis.currentFrame=i;p.process([],[[output.subarray(i,i+128)]]);}
  assert.deepEqual(output.subarray(0,expected.length),expected);assert(p.port.sent.some(m=>m.type==='traceEnded'&&m.seq===7));
 }
});
const fakePlayer=()=>({node:true,stop(){this.node=false;},async dispose(){this.disposed=true;this.node=false;}});
let fail='',created=[];
const mockRuntime={SoundRigPlayer:class{constructor(){Object.assign(this,fakePlayer());created.push(this);}async start(){if(fail==='start')throw Error('fixture start failure');this.node=true;}async measureControl(){if(fail==='ack')throw Error('fixture ack failure');}},createPlayer:()=>({processorSource:'trusted fixture'})};
await test('module/start/ack failures retain the old playing project',async()=>{
 for(const failure of ['import','start','ack']){fail=failure;const old=fakePlayer(),loader=new ProjectLoader({},old,async()=>{if(fail==='import')throw Error('fixture import failure');return mockRuntime;});await assert.rejects(loader.replace('test',project.rig,air));assert.equal(loader.active.player,old);assert(old.node);assert(!old.disposed);if(failure!=='import')assert(created.at(-1).disposed);}
});
await test('successful activation stops/disposes previous player; ninth import refused first',async()=>{
 fail='';const original=fakePlayer(),loader=new ProjectLoader({},original,async()=>mockRuntime);
 for(let i=0;i<8;i++){const next=await loader.replace('test'+i,project.rig,air);assert.equal(next.player.node,false);}
 assert(original.disposed);assert.equal(loader.attempts,8);const count=created.length;await assert.rejects(loader.replace('ninth',project.rig,air),/Eight/);assert.equal(created.length,count);
});
await test('overlapping activation is rejected without consuming a second import',async()=>{
 let resume;const deferred=new Promise(r=>resume=r),old=fakePlayer(),loader=new ProjectLoader({},old,async()=>{await deferred;return mockRuntime;});
 const first=loader.replace('first',project.rig,air);await assert.rejects(loader.replace('second',project.rig,air),/Another/);assert.equal(loader.attempts,1);resume();await first;
});
const max=read('evidence/project-max-bank.json'),memory=[],times=[];
await test('eight distinct maximum-bank modules fit bundle budget and bounded DSP workload',async()=>{
 for(let i=0;i<8;i++){
  const maxPack=structuredClone(max.pack);maxPack.pickup_confirm.title='Generation '+i;
  const start=performance.now(),r=await projectModule(project.rig,maxPack,true);memory.push({generation:i+1,importMs:performance.now()-start,sourceBytes:Buffer.byteLength(r.module),rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed});
  assert(Buffer.byteLength(r.module)<2097152);
  if(i===7){const feet=project.rig.layers.find(l=>l.id==='footsteps'),event=project.rig.layers.find(l=>l.event==='pickup');
   const stress={...project.rig,master:.8,layers:[...Array.from({length:5},(_,j)=>({...feet,id:'background_'+j,gain:1,pulseHz:12,when:[],filter:null})),{...event,gain:1,filter:null}]};
   const dsp=new r.imported.DSP(stress,48000,17,{speed:1,air:0,grounded:1,alive:1}),block=new Float32Array(128);for(let j=0;j<12;j++)dsp.trigger('pickup');
   for(let j=0;j<1000;j++){if(j%8===0)dsp.trigger('pickup');const start=performance.now();dsp.process(block);times.push(performance.now()-start);assert(dsp.events.length<=12);assert(block.every(Number.isFinite));}
  }
 }
 times.sort((a,b)=>a-b);assert(times[990]<128/48000*1000,times[990]);
});
fs.writeFileSync(new URL('exports/quality-before.wav',import.meta.url),new Uint8Array(off.imported.wavBytes(pOff,48000)));
fs.writeFileSync(new URL('exports/quality-after.wav',import.meta.url),new Uint8Array(on.imported.wavBytes(pOn,48000)));
const report={pass:true,cases:results.length,results,backgroundChangeDB:duckDB,eventOnlyPCMUnchanged:true,preparedSources:read('evidence/project-prepared.json').report.assets,maximumBank:memory,stress:{p99Ms:times[990],maxMs:times.at(-1),blockBudgetMs:128/48000*1000,blocks:1000,continuousVoices:5,eventCap:12},scope:'Executed signal/parser/transaction/module/worklet checks. Node memory/CPU excludes browser scheduling and physical playback. Signal improvements do not establish human preference.'};
fs.writeFileSync(new URL('evidence/project-runtime-test.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,preparedSources:Object.keys(report.preparedSources),maximumBank:{first:memory[0],last:memory.at(-1)}},null,2));

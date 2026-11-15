import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DSP,validateRig,validateTrace,renderPCM,renderTrace,TracePlayer,applyPatch,stableJSON,matchRMS,wavBytes} from './core.mjs';
import {SAMPLE_PACK,getSample} from './samples.mjs';
import {bundleModule} from './bundle.mjs';
import {assertGameRig} from './checks.mjs';
import {createTraceRecorder} from './integration-example.mjs';
import {preloadBaseline,createBaseline} from './phaser-baseline.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url)));
const rig=validateRig(read('hybrid-rig.json')),trace=read('example-trace.json'),rest={speed:0,air:0,grounded:1,alive:1};
const results=[];const test=(name,fn)=>{fn();results.push({name,pass:true});};
test('catalog PCM is bounded, finite, mono and exactzero at both endpoints',()=>{
 let bytes=0;for(const id of Object.keys(SAMPLE_PACK)){const s=getSample(id);bytes+=s.pcm.byteLength;assert(s.pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<=.9));assert.equal(s.pcm[0],0);assert.equal(s.pcm.at(-1),0);assert(s.pcm.length<=36000);assert.equal(s.license,'CC0-1.0');}assert(bytes<=1048576);
});
test('bad samples, duplicate pools, rates and extra model code reject',()=>{
 for(const change of [{samples:['missing']},{samples:['step_wood_a','step_wood_a']},{rate:.5},{code:'anything'},{variation:.2}]){const bad=structuredClone(rig);Object.assign(bad.layers[0],change);assert.throws(()=>validateRig(bad));}
 assert.throws(()=>new DSP(rig,24000));assert.throws(()=>new DSP(rig,8000));
});
test('verifier rejects silent kits, disconnected footsteps, silent events and wrong wind source',()=>{
 assertGameRig(rig);
 for(const mutate of [r=>r.master=0,r=>r.layers[0].event='land',r=>r.layers.filter(l=>l.event).forEach(l=>l.gain=0),r=>{const wind=r.layers.find(l=>l.id==='wind');Object.assign(wind,{type:'sample',filter:null,samples:['step_wood_a'],rate:1,variation:0});for(const key of ['wave','frequency','envelope','pitchEnd'])delete wind[key];}]){const bad=structuredClone(rig);mutate(bad);assert.throws(()=>assertGameRig(bad));}
});
test('downloadable recorder produces a valid independent host trace',()=>{
 const recorder=createTraceRecorder(rest);recorder.state({speed:1});recorder.event('pickup');const trace=recorder.finish();assert.equal(validateTrace(rig,trace).commands.length,2);assert.throws(()=>recorder.state({speed:null}));assert.throws(()=>recorder.event('unknown'));
});
test('minimal Phaser baseline gates and alternates footsteps using standard sound calls',()=>{
 const loaded=[],played=[],scene={time:{now:0},load:{audio:(...x)=>loaded.push(x)},sound:{play:(...x)=>played.push(x)}};
 preloadBaseline(scene);assert.equal(loaded.length,5);const baseline=createBaseline(scene);
 baseline.state({...rest,speed:1,grounded:0});baseline.state({...rest,speed:1,alive:0});baseline.state(rest);assert.equal(played.length,0);
 baseline.state({...rest,speed:1});scene.time.now=1000;baseline.state({...rest,speed:1});assert.notEqual(played[0][0],played[1][0]);baseline.event('pickup');assert.equal(played.at(-1)[0],'pickup_confirm');
});
test('null controls/intensities and malformed traces reject before scheduling',()=>{
 for(const mutate of [t=>t.initial.speed=null,t=>t.commands[0].controls.speed=null,t=>t.commands[0].atMs=-1,t=>t.commands[2].atMs=1,t=>t.commands[0].atMs=6000,t=>t.commands[0].event='pickup',t=>t.commands[4].intensity=null,t=>t.commands[4].event='unknown',t=>t.extra='x']){const t=structuredClone(trace);mutate(t);assert.throws(()=>validateTrace(rig,t));}
 assert.throws(()=>renderPCM(rig,{...rest,speed:null}));
});
test('sample event terminates and no-repeat selection is deterministic',()=>{
 const play=()=>{const d=new DSP(rig,48000,17,rest),ids=[];for(let i=0;i<20;i++){ids.push(d.trigger('land').sampleIDs[0]);d.process(new Float32Array(48000));}return ids;};
 const ids=play();assert.deepEqual(ids,play());for(let i=1;i<ids.length;i++)assert.notEqual(ids[i],ids[i-1]);
 const d=new DSP(rig,48000,17,rest);d.trigger('pickup');const p=new Float32Array(48000);d.process(p);assert(p.some(x=>x!==0));assert(p.subarray(24000).every(x=>x===0));assert.equal(d.events.length,0);
});
test('unchanged event layer stays independent of other events and layer order',()=>{
 const a=new DSP(rig,48000,17,rest),b=new DSP({...rig,layers:[...rig.layers].reverse()},48000,17,rest);
 a.trigger('hurt');a.trigger('pickup');for(let i=0;i<10;i++)assert.deepEqual(a.trigger('land').sampleIDs,b.trigger('land').sampleIDs);
 const d=new DSP(rig,48000,17,rest);d.trigger('land');const voice=d.events[0];d.process(new Float32Array(63));
 const next=applyPatch(rig,{layerId:'wind',changes:{filter:{type:'lowpass',cutoff:600}}},rig.layers.filter(l=>l.id!=='wind').map(l=>l.id));d.useRig(next);assert.equal(d.events[0],voice);assert.equal(d.events[0].layer,voice.layer);
});
const reference=renderTrace(rig,trace).pcm;
test('sample trace PCM is independent of block partition',()=>{for(const blockSize of [1,63,127,129,509,1024])assert.deepEqual(renderTrace(rig,trace,{blockSize}).pcm,reference);});
test('sample playback remains finite and terminates at supported output rates',()=>{
 for(const sampleRate of [32000,44100,48000,96000]){const p=renderTrace(rig,trace,{sampleRate}).pcm;assert(p.every(x=>Number.isFinite(x)&&Math.abs(x)<=.8));assert(p.some(x=>x!==0));assert(p.subarray(Math.ceil(5.8*sampleRate)).every(x=>x===0));assert.equal(p.at(-1),0);}
});
test('rest and inactive footsteps are silent; a normal trace does not overload the mix',()=>{
 assert(renderPCM(rig,rest).pcm.every(x=>x===0));
 const feet={...rig,layers:[rig.layers[0]]};assert(renderPCM(feet,{...rest,speed:1,grounded:0,air:1}).pcm.every(x=>x===0));
 assert(renderPCM(feet,{...rest,speed:1,alive:0}).pcm.every(x=>x===0));assert.equal(renderTrace(rig,trace).summary.saturatedSamples,0);
});
test('RMS comparison is equal-level, peak-safe and refuses silent inputs',()=>{
 const old=renderTrace(read('synth-baseline.json'),trace).pcm,matched=matchRMS(old,reference),rms=p=>Math.sqrt(p.reduce((s,x)=>s+x*x,0)/p.length);
 assert(Math.abs(rms(matched.a)-rms(matched.b))<1e-8);assert(matched.a.every(x=>Math.abs(x)<=.700001));assert(matched.b.every(x=>Math.abs(x)<=.700001));assert.throws(()=>matchRMS(new Float32Array(20),new Float32Array(20)));
 fs.writeFileSync(new URL('exports/before-synth.wav',import.meta.url),new Uint8Array(wavBytes(matched.a,48000)));fs.writeFileSync(new URL('exports/after-hybrid.wav',import.meta.url),new Uint8Array(wavBytes(matched.b,48000)));
});
test('WAV accepts nominal Float32 limiter ceiling and rejects genuine excess or noninteger rates',()=>{
 const clip=Float32Array.from([Math.fround(.8),-Math.fround(.8),0]);assert.equal(wavBytes(clip,48000).byteLength,50);assert.throws(()=>wavBytes(Float32Array.from([.81]),48000));assert.throws(()=>wavBytes(clip,48000.5));
});
test('maximum trace has1200 commands and exact same-time order',()=>{
 const t={version:1,durationMs:1000,initial:rest,commands:Array.from({length:1200},(_,i)=>({atMs:i*.8,type:'controls',controls:{speed:i%2}}))};
 assert.equal(renderTrace(rig,t).summary.commandsApplied,1200);t.commands.push({atMs:999,type:'event',event:'pickup'});assert.throws(()=>validateTrace(rig,t));
 const gated=structuredClone(rig);gated.layers=gated.layers.filter(l=>l.event==='pickup');gated.layers[0].when=[{control:'alive',op:'above',threshold:.5}];
 const first={...trace,durationMs:1000,commands:[{atMs:0,type:'controls',controls:{alive:0}},{atMs:0,type:'event',event:'pickup'}]};
 assert(renderTrace(gated,first).pcm.every(x=>x===0));assert(renderTrace(gated,{...first,commands:[...first.commands].reverse()}).pcm.some(x=>x!==0));
});
let Processor;globalThis.sampleRate=48000;globalThis.currentFrame=0;globalThis.AudioWorkletProcessor=class{constructor(){this.port={sent:[],postMessage(x){this.sent.push(x);}};}};globalThis.registerProcessor=(_,C)=>Processor=C;
await import('./worklet.mjs');
const offGrid={version:1,durationMs:1000.03,initial:rest,commands:[{atMs:0,type:'controls',controls:{speed:1}},{atMs:1/48,type:'event',event:'pickup'},{atMs:63/48,type:'controls',controls:{grounded:0,air:1}},{atMs:127/48,type:'event',event:'land',intensity:.8},{atMs:129/48,type:'controls',controls:{grounded:1,air:0}},{atMs:701.001,type:'event',event:'hurt'}]};
function run(C,rate=48000){globalThis.sampleRate=rate;const p=new C({processorOptions:{rig,controls:rest,seed:17}});p.port.onmessage({data:{type:'trace',trace:offGrid,seq:8}});const count=Math.round(offGrid.durationMs*rate/1000),out=new Float32Array(Math.ceil(count/128)*128);for(let frame=0;frame<out.length;frame+=128){globalThis.currentFrame=frame;p.process([],[[out.subarray(frame,frame+128)]]);}assert(p.port.sent.some(x=>x.type==='traceEnded'&&x.seq===8));return out.subarray(0,count);}
test('actual worklet replay matches off-quantum, same-frame and midquantum offline trace',()=>{for(const rate of [44100,48000,96000])assert.deepEqual(run(Processor,rate),renderTrace(rig,offGrid,{sampleRate:rate}).pcm);});
const source=Object.fromEntries(['core','processor','player','samples'].map(n=>[n,fs.readFileSync(new URL(n==='processor'?'worklet.mjs':n+'.mjs',import.meta.url),'utf8')]));
const moduleText=bundleModule(source,rig);assert(Buffer.byteLength(moduleText)<2097152);fs.writeFileSync(new URL('exports/hybrid-verified.mjs',import.meta.url),moduleText);
const bundled=await import('./exports/hybrid-verified.mjs');
test('standalone export includes source rights and reproduces sample trace',()=>{assert(!/^import /m.test(moduleText));assert(moduleText.includes('Creative Commons Zero, CC0'));assert.deepEqual(bundled.renderTrace(bundled.preset,trace).pcm,reference);});
await import('data:text/javascript;base64,'+Buffer.from(bundled.createPlayer().processorSource).toString('base64'));
test('actual embedded exported processor reproduces sample trace',()=>assert.deepEqual(run(Processor),renderTrace(rig,offGrid).pcm));
const stress={...rig,layers:Array.from({length:6},(_,i)=>({...rig.layers[2],id:'stress_'+i,event:'land',gain:1})),master:.8};
const dsp=new DSP(stress,48000,17,rest);for(let i=0;i<10;i++)dsp.trigger('land');assert.equal(dsp.events.length,12);
const times=[],block=new Float32Array(128);let saturated=0;
for(let i=0;i<1000;i++){if(i%100===0)dsp.trigger('land');const t=performance.now();const m=dsp.process(block);times.push(performance.now()-t);saturated+=m.saturatedSamples;assert(block.every(x=>Number.isFinite(x)&&Math.abs(x)<=.8));}
times.sort((a,b)=>a-b);
const summary={pass:true,cases:results.length,results,exportBytes:Buffer.byteLength(moduleText),decodedPCMBytes:53669*4,stress:{blocks:1000,sampleRate:48000,blockFrames:128,voiceCap:12,p50Ms:times[500],p99Ms:times[990],maxMs:times.at(-1),saturatedSamples:saturated,scope:'Node actual DSP stress; not browser callback or device underrun measurement.'},limitation:'Recorded source timbres, correctness, level matching and artifacts do not establish human preference or task savings.'};
fs.writeFileSync(new URL('evidence/hybrid-test.json',import.meta.url),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyPatch,stableJSON,renderTrace as baseRenderTrace,matchRMS,wavBytes} from './core.mjs';
import {projectModule} from './project-runtime.mjs';
const root=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root)));
const project=read('exports/browser-runnable/project.json'),{pack}=read('evidence/project-prepared.json');
const current=await projectModule(project.rig,pack,project.clearMix),component=await import('./exports/browser-downloaded-final.mjs');
const bytes=fs.readFileSync(new URL('exports/browser-downloaded-final.mjs',root));
// The current export slot is mutable; this regression checks the retained actual download.
assert.deepEqual(bytes,fs.readFileSync(new URL('exports/browser-runnable/component.mjs',root)));
assert.equal(stableJSON(component.preset),stableJSON(project.rig));
const frozen=read('evidence/project-intents-frozen.json'),records=['patch-59adb8273e64.json','patch-3062e57806d2.json'],meta=[];
for(let i=0;i<records.length;i++){
 const raw=read('evidence/'+records[i]),expected=frozen.cases[i],response=raw.response;
 assert(response.verified);assert.equal(response.attempts.length,1);assert.equal(raw.request.prompt,expected.prompt);assert.equal(response.patch.layerId,expected.target);
 const next=applyPatch(raw.request.rig,response.patch,raw.request.lockedIds),target=next.layers.find(l=>l.id===expected.target);
 for(const [key,value]of Object.entries(expected.expected))assert.deepEqual(target[key],value);
 for(const id of raw.request.lockedIds)assert.equal(stableJSON(next.layers.find(l=>l.id===id)),stableJSON(raw.request.rig.layers.find(l=>l.id===id)));
 const stem=rig=>({...rig,layers:rig.layers.filter(l=>raw.request.lockedIds.includes(l.id))});
 const trace=read('exports/runner-real-trace.json');
 assert.deepEqual(component.renderTrace(stem(raw.request.rig),trace).pcm,component.renderTrace(stem(next),trace).pcm);
 meta.push({id:expected.id,record:records[i],seconds:response.seconds,validatorSeconds:response.attempts[0].verification.seconds,lockedLayers:raw.request.lockedIds.length,pass:true});
}
let C;globalThis.AudioWorkletProcessor=class{constructor(){this.port={sent:[],postMessage(m){this.sent.push(m);}};}};globalThis.registerProcessor=(_,c)=>C=c;
await import('data:text/javascript;base64,'+Buffer.from(component.createPlayer().processorSource).toString('base64'));
const traces=[];
for(const name of ['exports/browser-project-trace.json','exports/runner-real-trace.json','example-trace.json']){
 const trace=read(name),expected=current.imported.renderTrace(project.rig,trace).pcm;
 assert.deepEqual(component.renderTrace(project.rig,trace).pcm,expected);
 globalThis.sampleRate=48000;globalThis.currentFrame=0;const p=new C({processorOptions:{rig:project.rig,controls:trace.initial,seed:17}});p.port.onmessage({data:{type:'trace',trace,seq:9}});
 const out=new Float32Array(Math.ceil(expected.length/128)*128);for(let frame=0;frame<out.length;frame+=128){globalThis.currentFrame=frame;p.process([],[[out.subarray(frame,frame+128)]]);}
 assert.deepEqual(out.subarray(0,expected.length),expected);assert(p.port.sent.some(m=>m.type==='traceEnded'&&m.seq===9));
 traces.push({file:name,commands:trace.commands.length,events:trace.commands.filter(c=>c.type==='event').map(c=>c.event),samples:expected.length,pass:true});
}
assert(traces[0].events.includes('pickup'));assert(traces[0].events.includes('land'));assert.deepEqual(new Set(traces[1].events),new Set(['pickup','land','hurt']));
const trace=read('exports/browser-project-trace.json'),baseline=read('synth-baseline.json');
const matched=matchRMS(baseRenderTrace(baseline,trace).pcm,component.renderTrace(project.rig,trace).pcm);
assert.deepEqual(Buffer.from(wavBytes(matched.b,48000)),fs.readFileSync(new URL('exports/browser-project-matched-final.wav',root)));
const report={pass:true,meta,traces,moduleSHA256:createHash('sha256').update(bytes).digest('hex'),moduleBytes:bytes.length,actualEmbeddedProcessorExecuted:true,downloadedWavByteExact:true,zipComponentByteExact:true,scope:'Actual downloaded project/component/WAV, two actual local Meta results, both real browser-game captures. Node processor parity is not device latency or human preference.'};
fs.writeFileSync(new URL('evidence/project-workflow-test.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

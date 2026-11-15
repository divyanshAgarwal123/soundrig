// Async decode and page lifecycle regression; synthetic audio/DOM, no speaker claim.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const nodes=new Map(),events={},radios=[{value:'land',addEventListener:(name,fn)=>events.change=fn}];
let cue='land',version='clean',starts=0,stops=0,disconnects=0,closed=0,decodeResolve;
const node=id=>nodes.get(id)??nodes.set(id,{disabled:true,className:'',textContent:'',setAttribute(k,v){this[k]=v;},getBoundingClientRect(){return {width:400};},getContext(){return {clearRect(){},fillRect(){}};}}).get(id);
const items=Object.fromEntries(['land','pickup','hurt'].map(c=>[c,Object.fromEntries(['clean','before'].map(v=>[v,{file:c+'-'+v+'.wav',seconds:1,peaks:[.1,.2,.1]}]))]));
class FakeAudio {
 constructor(){this.state='suspended';this.currentTime=0;}async resume(){this.state='running';}
 decodeAudioData(){return new Promise(r=>decodeResolve=r);}
 createBufferSource(){return {connect(){},disconnect(){disconnects++;},start(){starts++;},stop(){stops++;}};}
 createGain(){return {gain:{value:1},connect(){},disconnect(){disconnects++;}};}
 async close(){this.state='closed';closed++;}
}
const document={body:{dataset:{}},getElementById:node,documentElement:{},querySelector(q){return q.includes('name=cue')?{value:cue}:q.includes('name=version')?{value:version}:node(q);},querySelectorAll(){return radios;},addEventListener(name,fn){events[name]=fn;},hidden:false};
const context=vm.createContext({document,window:{addEventListener(name,fn){events[name]=fn;}},AudioContext:FakeAudio,devicePixelRatio:1,getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},fetch:async url=>({ok:true,json:async()=>({cues:items}),arrayBuffer:async()=>new ArrayBuffer(2)})});
const module=new vm.SourceTextModule(await fs.readFile(new URL('landing.mjs',import.meta.url),'utf8'),{context});
await module.link(()=>{throw Error('Unexpected import');});await module.evaluate();
const flush=async()=>{await new Promise(r=>setImmediate(r));};
const abandoned=node('preview-play').onclick();await flush();assert.equal(typeof decodeResolve,'function');cue='pickup';events.change();decodeResolve({});await abandoned;assert.equal(starts,0);assert.equal(document.body.dataset.playing,'false');
const first=node('preview-play').onclick();await flush();decodeResolve({});await first;assert.equal(starts,1);assert.equal(document.body.dataset.playing,'true');
document.hidden=true;events.visibilitychange();assert.equal(stops,1);assert.equal(document.body.dataset.playing,'false');
const navigating=node('hear').onclick();await flush();events.pagehide();decodeResolve({});await navigating;assert.equal(starts,1);assert.equal(closed,1);
document.hidden=false;const restored=node('hear').onclick();await flush();decodeResolve({});await restored;assert.equal(starts,2);assert.equal(document.body.dataset.playing,'true');events.pagehide();assert.equal(stops,2);assert.equal(closed,2);assert.equal(disconnects,4);
const report={pass:true,cases:4,scope:'Synthetic delayed decode selection, active playback hide, pending decode navigation, context recreation. Actual browser listening controls checked separately.'};
await fs.writeFile(new URL('evidence/studio-landing-tests.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

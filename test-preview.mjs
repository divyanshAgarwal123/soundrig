import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('app.mjs',import.meta.url),'utf8');
// Execute the actual browser preview functions with delayed Web Audio APIs.
const source=app.slice(app.indexOf('function stopPreview(){'),app.indexOf('async function liveCheck()'));
assert(source.includes('async function listen(which)'));
const resumes=[],sources=[],elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,value:'60'});return elements.get(id);};
class Context {
 resume(){return new Promise(resolve=>resumes.push(resolve));}
 suspend(){return Promise.resolve();}
 createBuffer(){return{copyToChannel(){}};}
 createGain(){return{gain:{value:0},connect(){},disconnect(){}};}
 createBufferSource(){const source={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;}
 get destination(){return{};}
}
const pcm=Float32Array.from([0,.1,-.1,0]),context=vm.createContext({AudioContext:Context,$,player:{node:null,stop(){},cancelTrace(){}},baseRenderTrace:()=>({pcm,summary:{}}),renderTrace:()=>({pcm,summary:{}}),matchRMS:()=>({a:pcm,b:pcm,gains:[1,1],targetRms:.05,scope:'test fixture'}),stopAudio(){context.player.stop();},saveEvidence(){},rig:{},synthBaseline:{},trace:{durationMs:100,commands:[]},evidence:{},console});
vm.runInContext('let previewContext=null,previewSource=null,previewGain=null,previewEpoch=0,replaying=false,busy=false,muted=false,comparisonCache=null;'+source,context);
const first=vm.runInContext("listen('before')",context),second=vm.runInContext("listen('after')",context);
assert.equal(resumes.length,2);resumes.splice(0).forEach(resolve=>resolve());await Promise.all([first,second]);
assert.equal(sources.length,1);assert(sources[0].started);
vm.runInContext('stopPreview()',context);assert(sources[0].stopped);
const cancelled=vm.runInContext("listen('before')",context);vm.runInContext('stopPreview()',context);resumes.splice(0).forEach(resolve=>resolve());await cancelled;assert.equal(sources.length,1);
vm.runInContext('muted=true',context);const muted=vm.runInContext("listen('after')",context);resumes.splice(0).forEach(resolve=>resolve());await muted;
assert.equal(vm.runInContext('previewGain.gain.value',context),0);vm.runInContext('stopPreview()',context);assert(sources.every(s=>s.stopped));
const result={pass:true,cases:3,checks:['overlapping pending listens create only one tracked source','stop cancels a pending resume without starting audio','muted preview starts at zero gain and stop tracks every source'],scope:'Actual app preview functions with delayed Web Audio fixtures; not device listening evidence.'};
fs.writeFileSync(new URL('evidence/preview-test.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

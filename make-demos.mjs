import fs from 'node:fs';import {createHash} from 'node:crypto';import {projectModule} from './project-runtime.mjs';
const parts=[];for await(const p of process.stdin)parts.push(p);const {project,pack}=JSON.parse(Buffer.concat(parts));
const classic=await projectModule(project.rig,pack,project.clearMix),studio=await projectModule(project.rig,pack,project.clearMix,'studio');
const dir=new URL('assets/demos/',import.meta.url);fs.mkdirSync(dir,{recursive:true});const cues={};
for(const event of ['pickup','land','hurt']){
 const trace={version:1,durationMs:1000,initial:{speed:0,air:0,grounded:1,alive:1},commands:[{atMs:10,type:'event',event}]};
 const a=classic.imported.renderTrace(project.rig,trace).pcm,b=studio.imported.renderTrace(project.rig,trace).pcm,pair=classic.imported.matchRMS(a,b),entry={};
 for(const [name,pcm]of [['before',pair.a],['clean',pair.b]]){const file=event+'-'+name+'.wav',wav=Buffer.from(studio.imported.wavBytes(pcm,48000));fs.writeFileSync(new URL(file,dir),wav);const peaks=Array.from({length:96},(_,i)=>{let peak=0;for(let j=i*500;j<(i+1)*500;j++)peak=Math.max(peak,Math.abs(pcm[j]));return peak;});entry[name]={file:'assets/demos/'+file,seconds:pcm.length/48000,peaks,wavSHA256:createHash('sha256').update(wav).digest('hex')};}
 cues[event]={...entry,gains:pair.gains,targetRMS:pair.targetRms};
}
fs.writeFileSync(new URL('cues.json',dir),JSON.stringify({cues,scope:'Same project, source recordings, seed and event trace. Before is classic interpolation/transfer; Clean is Studio mode. Whole-clip RMS matched with shared peak ceiling; subtle differences are expected for clean source recordings. Not a preference result.',project:project.name},null,2));
console.log('Wrote6 matched cue WAVs and measured waveform peaks.');

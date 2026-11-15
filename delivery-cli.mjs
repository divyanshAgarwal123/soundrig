import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {projectModule} from './project-runtime.mjs';
import {cueWAV} from './delivery-codec.mjs';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=Buffer.concat(chunks);if(input.length>4194304)throw Error('Delivery input exceeds4MiB');
const {project,pack}=JSON.parse(input),{imported:runtime,module}=await projectModule(project.rig,pack,project.clearMix,project.quality);
const hash=data=>createHash('sha256').update(data).digest('hex');
const initial={speed:0,air:0,grounded:1,alive:1},clips=[],files={};let frames=0;
for(const role of ['land','pickup','hurt','footstep']){
 const layer=project.rig.layers.find(l=>role==='footstep'?l.id==='footsteps':l.event===role);
 if(!layer||layer.type!=='sample')throw Error('Delivery needs sampled land, pickup, hurt and footsteps');
 for(let take=0;take<(role==='footstep'?2:3);take++){
  const seed=17+take*7919,controls={...initial,speed:role==='footstep'?1:0};
  const baked=structuredClone(layer);if(role==='footstep'){baked.samples=[layer.samples[take%layer.samples.length]];baked.event='land';baked.pulseHz=0;}
  const rig={...project.rig,layers:[baked]},params=runtime.resolveRig(rig,controls)[0];
  const ratio=Math.max(.75,params.rate*(1-baked.variation));
  const seconds=Math.max(...baked.samples.map(id=>runtime.getSample(id).seconds))/ratio+.02;
  const count=Math.max(4800,Math.ceil(seconds*48000));if(count>100800)throw Error('Delivery clip exceeds2.1seconds');
  const trace={version:1,durationMs:count/48,initial:controls,commands:[{atMs:0,type:'event',event:baked.event,intensity:1}]};
  const rendered=runtime.renderTrace(rig,trace,{seed}),id=role+'_'+String(take+1).padStart(2,'0');
  if(rendered.summary.saturatedSamples||rendered.summary.peak<1e-6)throw Error('Delivery cue is silent or overloaded: '+id);
  const wav=cueWAV(rendered.pcm);files['audio/'+id+'.wav']={encoding:'base64',data:wav.toString('base64')};
  clips.push({id,file:'audio/'+id+'.wav',role,seed,sourceSamples:baked.samples,frames:count,startFrame:frames,endFrame:frames+count,wavSHA256:hash(wav),peak:rendered.summary.peak,preLimitPeak:rendered.summary.preLimitPeak,pcm:rendered.pcm});frames+=count+4800;
 }
}
if(clips.length!==11||clips.reduce((n,c)=>n+c.frames,0)>24*48000)throw Error('Delivery exceeds11cues or24seconds');
const sprite=new Float32Array(frames-4800);for(const c of clips)sprite.set(c.pcm,c.startFrame);
files['sprite.wav']={encoding:'base64',data:cueWAV(sprite).toString('base64')};
const markers={resources:['sprite.wav'],spritemap:Object.fromEntries(clips.map(c=>[c.id,{start:c.startFrame/48000,end:c.endFrame/48000,loop:false}]))};
files['sprite.json']={encoding:'utf8',data:JSON.stringify(markers,null,2)};
const manifest={version:1,name:project.name,quality:project.quality??'classic',sampleRate:48000,channels:1,bits:16,componentSHA256:hash(module),projectSHA256:hash(JSON.stringify(project)),clips:clips.map(({pcm,...c})=>c),limits:{clips:11,clipFrames:100800,totalAudioSeconds:24,uncompressedBytes:12000*1024},scope:'Static full-intensity cues and isolated full-speed footsteps. Dynamic wind, cadence, changing controls and live ducking are not included. Takes use authored sample/rate variation; takes may match when no variation is authored. Source declarations do not verify ownership.'};
files['manifest.json']={encoding:'utf8',data:JSON.stringify(manifest,null,2)};
process.stdout.write(JSON.stringify({files,manifest}));

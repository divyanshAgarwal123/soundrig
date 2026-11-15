import {createPlayer,validateTrace,preset} from './component.mjs';
import {createTraceRecorder} from './recorder.mjs';
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d');
const audio=createPlayer({monitorGain:.6});
const project=await(await fetch('project.json')).json();$('name').textContent=project.name;
let included=validateTrace(preset,await(await fetch('trace.json')).json()),captured=null,recorder=null,replaying=false;
let x=0,y=0,vy=0,run=false,jump=false,alive=1,grounded=1,score=0,landings=0,hits=0,renderedEvents=0,lastControls='',lastTime=performance.now();
const collected=new Set(),controls=()=>({speed:alive&&run?1:0,air:alive&&!grounded?Math.min(1,Math.abs(vy)/330):0,grounded,alive});
const emit=name=>{audio.emit(name,1);recorder?.event(name,1);};
const paintStats=()=>{$('stats').textContent=JSON.stringify({componentLoaded:true,distance:Math.round(x),score,landings,hits,renderedEvents,alive,traceCommands:captured?.commands.length??0},null,2);};
audio.onmessage=m=>{if(m.type==='eventApplied'){renderedEvents+=m.added;paintStats();}if(m.type==='error')$('status').textContent=m.message;};
function reset(){x=0;y=0;vy=0;run=false;jump=false;alive=1;grounded=1;score=0;landings=0;hits=0;collected.clear();lastControls='';paintStats();}
function update(now){
 const dt=Math.min(.04,(now-lastTime)/1000);lastTime=now;
 if(!replaying&&!document.hidden){
  if(alive){
   if(run)x+=160*dt;
   if(jump&&grounded){vy=-330;grounded=0;}jump=false;
   if(!grounded){vy+=760*dt;y+=vy*dt;if(y>=0){y=0;vy=0;grounded=1;landings++;emit('land');}}
   for(const at of [120,250,510,670])if(x>=at&&!collected.has(at)){collected.add(at);score++;emit('pickup');}
   if(x>=350&&x<=390&&grounded){alive=0;hits++;run=false;emit('hurt');$('status').textContent='Barrier collision. Restart, then jump over it.';}
  }
  const state=controls(),key=JSON.stringify(state);audio.set(state);
  if(recorder&&key!==lastControls){recorder.state(state);lastControls=key;}
 }
 ctx.clearRect(0,0,800,260);ctx.fillStyle='#a5bdb0';ctx.fillRect(0,220,800,40);
 const camera=Math.max(0,x-100);
 ctx.fillStyle='#385b4f';ctx.fillRect(0,220,800,7);ctx.fillStyle='#b15b47';ctx.fillRect(350-camera+40,188,40,32);
 for(const at of [120,250,510,670])if(!collected.has(at)){ctx.fillStyle='#d9aa46';ctx.fillRect(at-camera+40,180,16,16);}
 ctx.fillStyle=alive?'#19322f':'#8d3728';ctx.fillRect(x-camera+40,y+185,20,35);
 ctx.fillStyle='#19322f';ctx.font='15px system-ui';ctx.fillText('Distance '+Math.round(x)+' · Parcels '+score,18,28);paintStats();requestAnimationFrame(update);
}
$('audio').onclick=async()=>{try{if(audio.node){audio.stop();$('audio').textContent='Enable audio';$('status').textContent='Audio stopped';}else{await audio.start();$('audio').textContent='Stop audio';$('status').textContent='Standalone audio running';}}catch(e){$('status').textContent=e.message;}};
$('run').onpointerdown=e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);run=true;};$('run').onpointerup=$('run').onpointercancel=$('run').onlostpointercapture=()=>run=false;
$('run').onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();run=true;}};$('run').onkeyup=$('run').onblur=()=>run=false;
$('jump').onclick=()=>jump=true;$('reset').onclick=reset;
canvas.onpointerdown=()=>canvas.focus();canvas.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();run=true;}if(e.key==='ArrowUp'){e.preventDefault();jump=true;}};canvas.onkeyup=e=>{if(e.key==='ArrowRight'){e.preventDefault();run=false;}};canvas.onblur=()=>run=false;
$('record').onclick=()=>{if(recorder||replaying)return;recorder=createTraceRecorder(controls(),6000);lastControls='';$('record').disabled=true;$('replay').disabled=true;$('trace-status').textContent='Capturing sound inputs for6seconds. Move and jump.';setTimeout(()=>{captured=recorder.finish();recorder=null;$('record').disabled=false;$('replay').disabled=false;$('trace-download').disabled=false;$('captured-json').value=JSON.stringify(captured,null,2);$('trace-status').textContent='Captured '+captured.commands.length+' sound commands.';paintStats();},6000);};
$('trace-download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(captured,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='runner-trace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('replay').onclick=async()=>{if(replaying||recorder)return;try{replaying=true;run=false;$('record').disabled=true;$('replay').disabled=true;await audio.start();$('audio').textContent='Stop audio';const summary=await audio.playTrace(captured??included);$('trace-status').textContent='Replay complete: '+summary.commandsApplied+' commands, '+summary.eventCommands+' events, '+summary.saturatedSamples+' overloaded samples.';}catch(e){$('trace-status').textContent=e.message;}finally{replaying=false;$('record').disabled=false;$('replay').disabled=false;audio.set(controls());}};
document.addEventListener('visibilitychange',()=>{run=false;if(document.hidden){audio.stop();$('audio').textContent='Enable audio';$('status').textContent='Audio stopped while hidden';}});window.addEventListener('blur',()=>run=false);window.addEventListener('pagehide',()=>audio.dispose());
$('status').textContent='Standalone component loaded. Enable audio to hear your project.';reset();requestAnimationFrame(update);

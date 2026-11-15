import * as runtime from './component.mjs';
import {createGameAudio} from './game-adapter.mjs';
import {checkContract} from './quality-contract.mjs';
const {createPlayer,validateTrace,preset}=runtime;
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d');
const audio=createPlayer({monitorGain:.6});
const project=await(await fetch('project.json')).json();$('name').textContent=project.name;
let included=validateTrace(preset,await(await fetch('trace.json')).json()),captured=null,recorder=null,replaying=false;
let x=0,y=0,vy=0,run=false,jump=false,alive=1,grounded=1,score=0,landings=0,hits=0,renderedEvents=0,lastControls='',lastTime=performance.now();
const collected=new Set(),controls=()=>({speed:alive&&run?1:0,air:alive&&!grounded?Math.min(1,Math.abs(vy)/330):0,grounded,alive});
const raw=()=>({vx:alive&&run?160:0,vy:alive?vy:0,onGround:Boolean(grounded),gameOver:!alive});
const mapping=await(await fetch('bindings.json')).json(),contract=await(await fetch('contract.json')).json();
const sound=createGameAudio({player:audio,bindings:mapping,initial:raw(),onError:message=>{$('status').textContent=message;if(!audio.node)$('audio').textContent='Enable audio';}});
const emit=name=>{recorder?.noteOutcome();return sound.event({land:'landed',pickup:'collected',hurt:'damaged'}[name],1);};
const paintStats=()=>{$('stats').textContent=JSON.stringify({componentLoaded:true,distance:Math.round(x),score,landings,hits,renderedEvents,alive,traceCommands:captured?.commands.length??0},null,2);};
audio.onmessage=m=>{if(m.type==='eventApplied'){renderedEvents+=m.added;paintStats();}if(m.type==='error')sound.interrupt(m.message);};
function reset(){if(recorder){recorder.cancel('Restarted; capture invalid');recorder=null;$('record').disabled=false;$('replay').disabled=false;$('trace-status').textContent='Capture discarded after restart. Previous trace retained.';}sound.interrupt('Game restarted. Enable audio again.');x=0;y=0;vy=0;run=false;jump=false;alive=1;grounded=1;score=0;landings=0;hits=0;collected.clear();lastControls='';paintStats();}
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
  try{sound.state(raw());}catch(error){sound.interrupt(error.message);}
 }
 ctx.clearRect(0,0,800,260);ctx.fillStyle='#a5bdb0';ctx.fillRect(0,220,800,40);
 const camera=Math.max(0,x-100);
 ctx.fillStyle='#385b4f';ctx.fillRect(0,220,800,7);ctx.fillStyle='#b15b47';ctx.fillRect(350-camera+40,188,40,32);
 for(const at of [120,250,510,670])if(!collected.has(at)){ctx.fillStyle='#d9aa46';ctx.fillRect(at-camera+40,180,16,16);}
 ctx.fillStyle=alive?'#19322f':'#8d3728';ctx.fillRect(x-camera+40,y+185,20,35);
 ctx.fillStyle='#19322f';ctx.font='15px system-ui';ctx.fillText('Distance '+Math.round(x)+' · Parcels '+score,18,28);paintStats();requestAnimationFrame(update);
}
$('audio').onclick=async()=>{try{if(audio.node){sound.interrupt('Audio stopped; capture invalid');$('audio').textContent='Enable audio';}else{await sound.start();$('audio').textContent='Stop audio';$('status').textContent='Connected adapter audio running';}}catch(e){$('status').textContent=e.message;}};
$('run').onpointerdown=e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);run=true;};$('run').onpointerup=$('run').onpointercancel=$('run').onlostpointercapture=()=>run=false;
$('run').onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();run=true;}};$('run').onkeyup=$('run').onblur=()=>run=false;
$('jump').onclick=()=>jump=true;$('reset').onclick=reset;
canvas.onpointerdown=()=>canvas.focus();canvas.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();run=true;}if(e.key==='ArrowUp'){e.preventDefault();jump=true;}};canvas.onkeyup=e=>{if(e.key==='ArrowRight'){e.preventDefault();run=false;}};canvas.onblur=()=>run=false;
$('record').onclick=()=>{if(recorder||replaying)return;try{const task=sound.capture(6000),before={land:landings,pickup:score,hurt:hits};recorder=task;$('record').disabled=true;$('replay').disabled=true;$('trace-status').textContent='Capturing raw-state adapter inputs for6seconds. Move and jump.';setTimeout(()=>{if(recorder!==task)return;try{const result=task.finish();captured=result.trace;$('trace-download').disabled=false;$('captured-json').value=JSON.stringify(captured,null,2);$('capture-info').hidden=false;$('capture-info').textContent=JSON.stringify({gameOutcomes:{land:landings-before.land,pickup:score-before.pickup,hurt:hits-before.hurt},mappingID:result.provenance.mappingID,termination:result.termination},null,2);$('trace-status').textContent='Captured '+captured.commands.length+' sound commands. Check expectations against the separate game outcomes.';}catch(error){$('trace-status').textContent=error.message+' Previous trace retained.';}finally{recorder=null;$('record').disabled=false;$('replay').disabled=false;paintStats();}},6005);}catch(error){$('trace-status').textContent=error.message;}};
$('trace-download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(captured,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='runner-trace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('replay').onclick=async()=>{if(replaying||recorder)return;try{replaying=true;run=false;$('record').disabled=true;$('replay').disabled=true;await sound.start();$('audio').textContent='Stop audio';const summary=await audio.playTrace(captured??included);$('trace-status').textContent='Replay complete: '+summary.commandsApplied+' commands, '+summary.eventCommands+' events, '+summary.saturatedSamples+' overloaded samples.';}catch(e){$('trace-status').textContent=e.message;}finally{replaying=false;$('record').disabled=false;$('replay').disabled=false;audio.set(controls());}};
$('checks').onclick=async()=>{if(recorder||replaying)return;$('checks').disabled=true;try{const report=await checkContract(runtime,preset,contract);$('checks-results').replaceChildren();for(const c of report.cases){const row=document.createElement('li');row.textContent=(c.pass?'PASS · ':'FAIL · ')+c.id+' · '+c.failures.join('; ');$('checks-results').append(row);}$('checks-status').textContent=(report.pass?'PASS':'FAIL')+' · '+report.cases.length+' saved checks. Signal metrics, not a listening preference verdict.';}catch(error){$('checks-status').textContent=error.message;}finally{$('checks').disabled=false;}};
document.addEventListener('visibilitychange',()=>{run=false;if(document.hidden){sound.interrupt('Audio stopped while hidden; capture invalid');$('audio').textContent='Enable audio';}});window.addEventListener('blur',()=>run=false);window.addEventListener('pagehide',()=>sound.dispose());
$('status').textContent='Standalone component loaded. Enable audio to hear your project.';reset();requestAnimationFrame(update);

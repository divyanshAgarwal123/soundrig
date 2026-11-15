// Explicit game wiring. No engine inference or model-generated code.
const CONTROLS=['speed','air','grounded','alive'], EVENTS=['land','pickup','hurt'];
const fail=message=>{throw Error(message);};
const object=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('Unsupported binding fields');};
export const DEFAULT_BINDINGS={version:1,controls:{speed:{field:'vx',min:0,max:160,absolute:true},air:{field:'vy',min:0,max:330,absolute:true},grounded:{field:'onGround',min:0,max:1},alive:{field:'gameOver',min:0,max:1,invert:true}},events:{landed:'land',collected:'pickup',damaged:'hurt'}};
export function validateBindings(input){
 object(input,['version','controls','events']);if(input.version!==1)fail('Binding version1 required');
 object(input.controls,CONTROLS);const controls={};
 for(const key of CONTROLS){const b=input.controls[key];object(b,['field','min','max','absolute','invert']);
  if(typeof b.field!=='string'||! /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(b.field)||['constructor','prototype'].includes(b.field))fail('Choose an explicit raw state field');
  if(!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.max<=b.min||Math.abs(b.min)>1e6||Math.abs(b.max)>1e6)fail('Binding needs a finite increasing range');
  if(['absolute','invert'].some(k=>k in b&&typeof b[k]!=='boolean'))fail('Boolean mapping flags required');
  controls[key]={field:b.field,min:b.min,max:b.max,absolute:b.absolute??false,invert:b.invert??false};
 }
 if(!input.events||typeof input.events!=='object'||Array.isArray(input.events)||!Object.keys(input.events).length||Object.keys(input.events).length>16)fail('One to16 named event aliases required');
 const events={};for(const key of Object.keys(input.events).sort()){if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)||!EVENTS.includes(input.events[key]))fail('Map an explicit alias to land, pickup or hurt');events[key]=input.events[key];}
 return {version:1,controls,events};
}
export function normalizeControls(bindings,raw){
 if(!raw||typeof raw!=='object')fail('Raw game state required');const result={};
 for(const key of CONTROLS){const b=bindings.controls[key];if(!Object.hasOwn(raw,b.field))fail('Missing raw field: '+b.field);let value=raw[b.field];
  if(typeof value==='boolean')value=Number(value);if(typeof value!=='number'||!Number.isFinite(value))fail('Finite raw field required: '+b.field);
  if(b.absolute)value=Math.abs(value);value=Math.max(0,Math.min(1,(value-b.min)/(b.max-b.min)));
  // Stable four-decimal controls suppress physics float noise in both live and recorded input.
  result[key]=Math.round((b.invert?1-value:value)*10000)/10000;
 }return result;
}
export function createGameAudio({player,bindings=DEFAULT_BINDINGS,initial,clock=()=>performance.now(),onError=()=>{}}){
 const mapping=validateBindings(bindings),mappingID=JSON.stringify(mapping);let current=normalizeControls(mapping,initial),lastSent='',capture=null,disposed=false,accepting=false,epoch=0,watched=null,pendingStart=null;
 const abort=reason=>{if(capture&&!capture.error)capture.error=reason;};
 const contextChanged=()=>{if(!disposed&&watched?.state!=='running')interrupt('Audio context '+watched.state+'; capture invalid. Enable audio again.');};
 function watch(){if(watched===player.context)return;watched?.removeEventListener?.('statechange',contextChanged);watched=player.context;watched?.addEventListener?.('statechange',contextChanged);}
 function interrupt(reason='Playback interrupted; capture invalid'){
  if(disposed)return;epoch++;pendingStart=null;abort(reason);accepting=false;lastSent='';player.stop();onError(reason);
 }
 function append(command){
  if(!capture||capture.error)return;const atMs=clock()-capture.start;
  if(!Number.isFinite(atMs)||atMs<0||atMs<capture.last){abort('Capture clock moved backwards or became invalid');onError(capture.error);return;}
  if(atMs>=capture.trace.durationMs)return;
  if(capture.trace.commands.length===1200){abort('Capture exceeded1200commands; no partial trace saved');onError(capture.error);return;}
  capture.last=atMs;capture.trace.commands.push({...command,atMs});
 }
 function available(){if(disposed)fail('Game audio disposed');if(watched&&watched.state!=='running')contextChanged();else if(accepting&&!player.node)interrupt('Audio processor stopped; capture invalid. Enable audio again.');return accepting;}
 const api={
  mapping,mappingID,
  state(raw){const values=normalizeControls(mapping,raw),prior=current;current=values;if(!available())return false;const key=JSON.stringify(values);if(key===lastSent)return false;const changed=lastSent?Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==prior[k])):values;append({type:'controls',controls:changed});lastSent=key;player.set(changed);return true;},
  event(alias,intensity=1){if(!Object.hasOwn(mapping.events,alias))fail('Unknown game event alias: '+alias);if(typeof intensity!=='number'||!Number.isFinite(intensity)||intensity<0||intensity>1)fail('Event intensity must be0–1');if(!available())return false;append({type:'event',event:mapping.events[alias],intensity});return player.emit(mapping.events[alias],intensity);},
  async start(){if(disposed)fail('Game audio disposed');if(pendingStart)return pendingStart;const id=++epoch;const task=(async()=>{const started=await player.start();if(disposed||id!==epoch)return false;watch();if(!started||!player.node||watched&&watched.state!=='running')fail('Audio did not start; enable it again');accepting=true;lastSent='';player.set(current);return true;})();pendingStart=task;try{return await task;}finally{if(pendingStart===task)pendingStart=null;}},
  interrupt,
  capture(durationMs=6000){if(!available())fail('Enable audio after interruption before capturing');if(capture)fail('A capture is already active');if(!Number.isFinite(durationMs)||durationMs<100||durationMs>10000)fail('Capture100–10000ms');const start=clock();if(!Number.isFinite(start))fail('Finite capture clock required');
   const run={start,last:0,error:null,trace:{version:1,durationMs,initial:{...current},commands:[]}};capture=run;
   return {finish(){if(capture!==run)fail('Capture is no longer active');available();capture=null;if(run.error)fail(run.error);const ended=clock();if(!Number.isFinite(ended)||ended-start<durationMs)fail('Capture finished before its declared duration or clock became invalid');return {trace:structuredClone(run.trace),provenance:{kind:'captured',source:'Explicit game adapter; declared game-outcome expectations remain separate',mappingID},termination:'complete'};},noteOutcome(){if(capture===run&&clock()>=start+durationMs)abort('Game outcome arrived after capture cutoff; repeat this capture. Previous trace retained.');},cancel(reason='Capture cancelled'){if(capture===run){abort(reason);capture=null;}},get error(){return run.error;}};
  },
  dispose(){if(disposed)return;interrupt('Game audio disposed; capture invalid');disposed=true;watched?.removeEventListener?.('statechange',contextChanged);watched=null;return player.dispose();},
  get controls(){return {...current};},get active(){return accepting&&!disposed&&Boolean(player.node)&&(!watched||watched.state==='running');}
 };return api;
}
export function attachPhaserScene(scene,{readState,...options}){
 if(!scene?.events?.on||typeof readState!=='function')fail('Phaser scene and explicit readState function required');
 const audio=createGameAudio({...options,initial:readState()});const owned=[];
 if(Object.keys(audio.mapping.events).some(name=>['postupdate','pause','sleep','shutdown','destroy','resume','wake'].includes(name)))fail('Use custom event aliases, not Phaser lifecycle names');
 const on=(name,fn)=>{scene.events.on(name,fn);owned.push([name,fn]);};
 on('postupdate',()=>{try{audio.state(readState());}catch(error){audio.interrupt(error.message);}});
 for(const alias of Object.keys(audio.mapping.events))on(alias,(intensity=1)=>{try{audio.event(alias,intensity);}catch(error){audio.interrupt(error.message);}});
 on('pause',()=>audio.interrupt('Scene paused; capture invalid'));on('sleep',()=>audio.interrupt('Scene asleep; capture invalid'));
 let gone=false;const disposeAudio=audio.dispose;const dispose=()=>{if(gone)return;gone=true;for(const [name,fn]of owned)scene.events.off(name,fn);return disposeAudio();};
 on('shutdown',dispose);on('destroy',dispose);audio.dispose=dispose;return audio;
}

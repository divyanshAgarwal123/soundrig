// Arithmetic audio checks on declared scenarios. These do not judge sound preference.
const EPS=1e-9,EVENTS=['land','pickup','hurt'];
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function digest(value){const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(typeof value==='string'?value:canonical(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export function pcmBytes(pcm){const bytes=new Uint8Array(pcm.length*4),view=new DataView(bytes.buffer);for(let i=0;i<pcm.length;i++)view.setFloat32(i*4,pcm[i],true);return bytes;}
function object(x,allowed){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw Error('Unsupported contract fields');}
function number(x,min,max,label){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error('Invalid '+label);}
export function validateContract(runtime,rig,input){
 object(input,['version','requiredEvents','cases']);if(input.version!==1||new TextEncoder().encode(JSON.stringify(input)).length>32768)throw Error('Contract version1, at most32KiB required');
 if(!Array.isArray(input.requiredEvents)||new Set(input.requiredEvents).size!==input.requiredEvents.length||input.requiredEvents.some(e=>!EVENTS.includes(e)))throw Error('Explicit required event coverage needed');
 if(!Array.isArray(input.cases)||!input.cases.length||input.cases.length>6)throw Error('One to6 named checks required');
 const ids=new Set();let duration=0;
 for(const c of input.cases){object(c,['id','trace','expect','provenance']);if(typeof c.id!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,59}$/.test(c.id)||ids.has(c.id))throw Error('Unique check name required');ids.add(c.id);
  const trace=runtime.validateTrace(rig,c.trace);duration+=trace.durationMs;
  object(c.expect,['events','maxPreLimitPeak','minRMS','silence']);number(c.expect.maxPreLimitPeak,0,2,'headroom threshold');number(c.expect.minRMS,0,1,'minimum RMS');object(c.expect.events,EVENTS);
  for(const [event,rule]of Object.entries(c.expect.events)){object(rule,['count','minRMS']);number(rule.count,0,1200,'expected event count');if(!Number.isInteger(rule.count))throw Error('Integer event count required');number(rule.minRMS,0,1,'event RMS threshold');if(!rule.count&&rule.minRMS)throw Error('A zero-event expectation needs zero cue RMS');}
  if(!Array.isArray(c.expect.silence)||c.expect.silence.length>4)throw Error('At most4 silence windows per check');
  for(const w of c.expect.silence){object(w,['fromMs','toMs','maxRMS']);number(w.fromMs,0,trace.durationMs,'silence start');number(w.toMs,w.fromMs+.1,trace.durationMs,'silence end');number(w.maxRMS,0,1,'silence RMS');}
  object(c.provenance,['kind','source','mappingID']);if(!['captured','imported','synthetic'].includes(c.provenance.kind)||typeof c.provenance.source!=='string'||c.provenance.source.length>240||c.provenance.mappingID!=null&&(typeof c.provenance.mappingID!=='string'||c.provenance.mappingID.length>2048))throw Error('Explicit bounded trace provenance required');
 }if(duration>30000)throw Error('Contract exceeds30seconds total');return structuredClone(input);
}
export function rms(pcm,from=0,to=pcm.length){let sum=0;for(let i=from;i<to;i++){if(!Number.isFinite(pcm[i]))throw Error('Non-finite rendered PCM');sum+=pcm[i]*pcm[i];}return Math.sqrt(sum/Math.max(1,to-from));}
export function compactTrace(trace){const next=structuredClone(trace),state={...next.initial};next.commands=next.commands.flatMap(c=>{if(c.type!=='controls')return [c];const controls=Object.fromEntries(Object.entries(c.controls).filter(([k,v])=>v!==state[k]));Object.assign(state,c.controls);return Object.keys(controls).length?[{...c,controls}]:[];});return next;}
export async function checkContract(runtime,rig,input){
 const suite=validateContract(runtime,rig,input),cases=[],coverage={};const began=performance.now();
 for(const c of suite.cases){
  const full=runtime.renderTrace(rig,c.trace,{sampleRate:48000,blockSize:128,seed:17}),failures=[],level=rms(full.pcm),events={};
  if(full.summary.preLimitPeak>c.expect.maxPreLimitPeak+EPS)failures.push(`pre-limiter peak ${full.summary.preLimitPeak.toFixed(6)} exceeds ${c.expect.maxPreLimitPeak}`);
  if(full.summary.saturatedSamples)failures.push(`${full.summary.saturatedSamples} overloaded samples`);
  if(level+EPS<c.expect.minRMS)failures.push(`RMS ${level.toFixed(6)} below ${c.expect.minRMS}`);
  const silent=c.expect.silence.map(w=>{const value=rms(full.pcm,Math.round(w.fromMs*48),Math.round(w.toMs*48));if(value>w.maxRMS+EPS)failures.push(`silence ${w.fromMs}–${w.toMs}ms RMS ${value.toFixed(6)} exceeds ${w.maxRMS}`);return {...w,rms:value};});
  for(const [event,rule]of Object.entries(c.expect.events)){
   const commands=c.trace.commands.filter(x=>x.type==='event'&&x.event===event&&(x.intensity??1)>0);coverage[event]=(coverage[event]??0)+commands.length;
   if(commands.length!==rule.count)failures.push(`${event}: expected ${rule.count} events, recorded ${commands.length}`);
   let minimumCueRMS=null;
   if(commands.length&&rule.minRMS){minimumCueRMS=0;const layers=rig.layers.filter(l=>l.event===event);if(layers.length){const stem=runtime.renderTrace({...rig,layers},c.trace,{sampleRate:48000,blockSize:128,seed:17}).pcm;minimumCueRMS=Math.min(...commands.map(x=>rms(stem,Math.round(x.atMs*48),Math.min(stem.length,Math.round((x.atMs+250)*48)))));}
    if(minimumCueRMS+EPS<rule.minRMS)failures.push(`${event}: cue RMS ${minimumCueRMS.toFixed(6)} below ${rule.minRMS}`);
   }events[event]={count:commands.length,expected:rule.count,minimumCueRMS,threshold:rule.minRMS};
  }
  cases.push({id:c.id,pass:!failures.length,failures,provenance:c.provenance,traceSHA256:await digest(c.trace),pcmSHA256:await digest(pcmBytes(full.pcm)),commands:c.trace.commands.length,events,rms:level,summary:full.summary,silence:silent});
 }
 const missing=suite.requiredEvents.filter(e=>!coverage[e]);
 return {version:1,pass:cases.every(c=>c.pass)&&!missing.length,contractSHA256:await digest(suite),rigSHA256:await digest(rig),settings:{sampleRate:48000,blockSize:128,seed:17,epsilon:EPS,cueWindowMs:250},cases,coverage,missingEvents:missing,seconds:(performance.now()-began)/1000,scope:'Declared event counts and arithmetic signal checks on the exact project runtime. Cue RMS isolates named-event layers; same-event tails overlap. No perception or ownership certification.'};
}

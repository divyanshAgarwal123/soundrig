// A plain recorder for this kit's normalized interface. No engine or model dependency.
export function createTraceRecorder(initial, durationMs = 6000) {
  const keys=['speed','air','grounded','alive'],events=['land','pickup','hurt'];
  const check=values=>{if(!values||typeof values!=='object'||Object.keys(values).some(k=>!keys.includes(k))||Object.values(values).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw Error('Normalized game controls required');return {...values};};
  if(!Number.isFinite(durationMs)||durationMs<100||durationMs>10000)throw Error('Record100–10000ms');
  const state=check(initial);if(Object.keys(state).length!==keys.length)throw Error('Provide every initial control');
  const start=performance.now(),trace={version:1,durationMs,initial:state,commands:[]};
  const append=command=>{const atMs=performance.now()-start;if(atMs>=durationMs)return false;if(trace.commands.length===1200)throw Error('Trace command limit reached');trace.commands.push({...command,atMs});return true;};
  return {
    state:values=>append({type:'controls',controls:check(values)}),
    event:(event,intensity=1)=>{if(!events.includes(event)||!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('Declared game event required');return append({type:'event',event,intensity});},
    finish:()=>JSON.parse(JSON.stringify(trace)),
  };
}
// Call recorder.state(...) and recorder.event(...) from the same hooks as audio.
// After6seconds: JSON.stringify(recorder.finish()); paste into SoundRig's trace input.

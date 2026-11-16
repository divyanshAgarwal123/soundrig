import {validateRig, resolveRig, applyPatch, stableJSON, renderPCM as baseRenderPCM, renderTrace as baseRenderTrace, validateTrace, matchRMS, wavBytes as baseWavBytes} from './core.mjs';
import {assertGameRig,gameChecks} from './checks.mjs';
import {SAMPLE_PACK} from './samples.mjs';
import {SoundRigPlayer} from './player.mjs';
import {createGame} from './game.mjs';
import {ProjectLoader} from './project-loader.mjs';
import {DEFAULT_BINDINGS} from './game-adapter.mjs';
import {validateContract,checkContract,digest,compactTrace} from './quality-contract.mjs';
import {RecordingStage} from './recording-stage.mjs';
import {editCue} from './cue-edit.mjs';
import './studio-ux.mjs';
import {validateSnapshot,snapshotChanges} from './revision-data.mjs';

const $ = id => document.getElementById(id);
const json = async path => { const response = await fetch(path); if (!response.ok) throw Error(`Could not load ${path}`); return response.json(); };
const api = async (path, data) => {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-SoundRig': 'local-proof'}, body: JSON.stringify(data), signal: AbortSignal.timeout(360000)});
  const result = await response.json(); if (!response.ok) { const error=Error(result.error||'Request failed');error.record=result.record;throw error; } return result;
};
let manifest, rig, player, game, busy = false, muted = false, backendEnabled = true, recording = null;
let trace, synthBaseline, comparisonCache=null, previewContext=null, previewSource=null, previewGain=null, previewEpoch=0, replaying=false;
let state = {speed: 0, air: 0, grounded: 0, alive: 1, x: 100, y: 450, score: 0, landings: 0, pickups: 0};
let projectRuntime={renderPCM:baseRenderPCM,renderTrace:baseRenderTrace,SoundRigPlayer,SAMPLE_PACK,wavBytes:baseWavBytes},projectLoader;
let project={version:1,name:'First Platformer sound kit',assets:{},clearMix:false},projectDigest=null;
let gameAudio=null,gameplayContract={version:1,requiredEvents:['land','pickup','hurt'],cases:[]},contractReport=null,traceProvenance={kind:'synthetic',source:'Included example'},captureOutcomes=null;
const recordingStage=new RecordingStage();let recordingURLs=[],manualUndo=null;
let workspaceEpoch=0,selectedRevision=null,revisionList=null;
const renderPCM=(...args)=>projectRuntime.renderPCM(...args),renderTrace=(...args)=>projectRuntime.renderTrace(...args),wavBytes=(...args)=>(projectRuntime.wavBytes??baseWavBytes)(...args);
const began = performance.now(), evidence = {scope: 'App-owned browser diagnostics, separate from independent verification', liveAudio: null, exportParity: null, wavReplay: null};
const bindings = s => ({speed: s.speed, air: s.air, grounded: s.grounded, alive: s.alive});
const names = array => [...array].sort().join('|');
function checkedRig(input) {
  const next = assertGameRig(input);
  if (names(next.controls.map(c => c.id)) !== names(manifest.controls.map(c => c.id)) || names(next.events) !== names(manifest.events.map(e => e.id))) throw Error('The rig must use this game’s confirmed controls and events. Current rig retained.');
  return next;
}
function status(message, error = false) { $('status').textContent = message; $('status').dataset.error = String(error); const notice=$('studio-notice'); if(notice){notice.hidden=!error;notice.textContent=error?message:'';} }
function saveEvidence() { api('/api/browser-evidence', evidence).catch(() => {}); }
function download(data, type, name) {
  const url = URL.createObjectURL(new Blob([data], {type})), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function lockEditing(locked) {
  for (const id of ['compile', 'patch', 'baseline', 'target', 'cutoff', 'apply-json', 'export', 'export-json', 'export-wav', 'model-toggle','material','capture-trace','replay-trace','listen-before','listen-after','trace-wav','import-trace','download-trace','example-trace']) $(id).disabled = locked;
  for(const id of ['sound-file','sound-slot','source-note','import-sound','project-open','project-save','project-export','clear-mix','project-name','headroom','project-example','quick-start','quality','delivery-export'])$(id).disabled=locked;
  for(const id of ['revision-label','revision-save','revision-refresh','revision-import','revision-restore','revision-download','revision-remove','revision-confirm-remove','revision-cancel-remove','recording-apply','recording-cancel','mix-cue','mix-gain','mix-rate','mix-apply','mix-audition','delivery-target'])$(id).disabled=locked;
  $('mix-undo').disabled=locked||!manualUndo;
  $('restart').disabled=locked;
  $('game-pause').disabled=locked||['complete','failed'].includes(game?.getState().phase);
  for(const id of ['workflow-example','workflow-run','workflow-add','workflow-save','workflow-remove','workflow-export','workflow-open','workflow-json','workflow-name','expect-land','expect-pickup','expect-hurt','workflow-guard'])$(id).disabled=locked;
  if(!locked){$('workflow-guard').disabled=!gameplayContract.cases.length;$('revision-restore').disabled=projectLoader?.attempts>=8;}
  if (!locked) { refreshCutoff(); refreshMaterial(); }
}
async function author(kind) {
  if (busy) return;
  stopPreview();
  busy = true; lockEditing(true); const started = performance.now();
  const message = kind === 'compile' ? 'Meta is compiling this game’s behavior' : 'Meta is editing the unlocked layer';
  const timer = setInterval(() => status(`${message}… ${((performance.now() - started) / 1000).toFixed(0)} s. ${player.node?'The current rig keeps playing.':'The current kit is retained.'}`), 500);
  status(message + '…');
  $('authoring-record').hidden=true;
  try {
    const guards=guardContract();
    if (kind === 'compile') {
      const result = await api('/api/compile', {prompt: $('intent').value,projectDigest,rig,...guards});
      showAuthoringRecord(result.record,result);
      await checkGuardResponse(result,result.rig,guards.contract);
      install(result.rig, `Fresh Meta / ${result.seconds.toFixed(1)} s / ${result.record}`);
      status(`Fresh ${result.model} kit passed ${result.checks?.length ?? 0} behavior checks in ${result.seconds.toFixed(1)} s (${result.attempts?.length ?? 1} attempt).`);
      evidence.lastMetaCompile={record:result.record,checks:result.checks,attempts:result.attempts?.length,seconds:result.seconds};saveEvidence();
      if(result.contract){contractReport=result.contract;paintContract();$('workflow-status').textContent=`Meta candidate passed all ${contractReport.cases.length} saved checks before application.`;}
    } else {
      const target = $('target').value, locks = rig.layers.filter(l => l.id !== target).map(l => l.id), before = rig;
      const result = await api('/api/patch', {prompt: $('edit-intent').value, rig, layerId: target, lockedIds: locks,projectDigest,...guards});
      showAuthoringRecord(result.record,result);
      if (result.patch.layerId !== target) throw Error('Meta addressed another layer. Current rig retained.');
      const next = applyPatch(before, result.patch, locks);
      await checkGuardResponse(result,next,guards.contract);
      install(next, `Meta selective edit / ${result.seconds.toFixed(1)} s / ${result.record}`, target);
      showDiff(before, next, target, locks);
      evidence.lastMetaPatch = {record: result.record, seconds: result.seconds, target, lockedLayers: locks, preserved: locks.every(id => stableJSON(before.layers.find(l => l.id === id)) === stableJSON(next.layers.find(l => l.id === id)))};
      saveEvidence(); status(`Meta edit applied. ${locks.length} locked layers preserved exactly.`);
      if(result.contract){contractReport=result.contract;paintContract();$('workflow-status').textContent=`Meta candidate passed all ${contractReport.cases.length} saved checks before application.`;}
    }
  } catch (error) { showAuthoringRecord(error.record,{error:error.message});status(error.message + ' Your current rig is unchanged.', true); }
  finally { clearInterval(timer); busy = false; lockEditing(false); }
}
let receiptURL=null;
function showAuthoringRecord(name,result){if(typeof name==='string'&&/^(compile|patch)-[a-f0-9]{12}\.json$/.test(name)){if(receiptURL)URL.revokeObjectURL(receiptURL);receiptURL=URL.createObjectURL(new Blob([JSON.stringify({record:name,result:result??null,scope:'Browser result receipt. Raw authoring journals remain private local files.'},null,2)],{type:'application/json'}));$('authoring-record').href=receiptURL;$('authoring-record').download=name;$('authoring-record').textContent='Save result receipt';$('authoring-record').hidden=false;}}
function install(input, source, preferredTarget = $('target').value, options = {}) {
  const next = checkedRig(input);
  manualUndo=null;if(!options.transactional)clearRecordingReview();
  invalidateContract();
  if(!options.transactional)stopPreview(); comparisonCache=null;
  if (options.paintOnly) {}
  else if (player) player.useRig(next);
  else {
    player = new projectRuntime.SoundRigPlayer(next, {monitorGain: .6});
    player.onmessage = message => {
      if (message.type === 'meter') { $('processor-status').textContent = `Audio thread · ${(message.rms * 100).toFixed(2)}% RMS · ${message.voices} event voices`; evidence.processor={sampleRate:message.sampleRate,maxRenderMs:message.maxRenderMs ?? null}; }
      if (message.type === 'error') { gameAudio?.interrupt(message.message);status(message.message, true); $('audio-status').textContent = 'Audio stopped';$('enable-audio').textContent='Enable audio'; }
    };
  }
  rig = next; if(!options.paintOnly)player.set(bindings(state));
  $('diff').hidden = true; $('diff').textContent = '';
  $('rig-source').textContent = source;
  $('rig-json').value = JSON.stringify(rig, null, 2);
  $('layer-count').textContent = rig.layers.length + ' layers';
  $('target').replaceChildren(); $('layers').replaceChildren();
  for (const layer of rig.layers) {
    const option = document.createElement('option'); option.value = layer.id; option.textContent = layer.id.replaceAll('_', ' '); $('target').append(option);
    const row = document.createElement('li'), title = document.createElement('strong'), detail = document.createElement('small');
    title.textContent = layer.id.replaceAll('_', ' ');
    detail.textContent = layer.type==='sample' ? `${layer.samples.length} ${layer.samples.some(id=>projectRuntime.SAMPLE_PACK[id].pack==='project')?'project sound':'Kenney variation'}${layer.samples.length===1?'':'s'} / ${layer.event ?? 'follows '+layer.gain.control}` : layer.event ? layer.event + ' / one shot' : (typeof layer.gain === 'object' ? layer.gain.control + ' → level' : layer.type + ' / continuous');
    row.append(title, detail);
    if (layer.event) {
      const button = document.createElement('button'); button.textContent = 'Audition'; button.setAttribute('aria-label', 'Audition ' + layer.event);
      button.onclick = async () => { try { if (!player.node) await enableAudio(); player.emit(layer.event, 1); } catch (error) { status(error.message, true); } };
      row.append(button);
    }
    $('layers').append(row);
  }
  const wind = rig.layers.find(l => l.type === 'noise' && l.event === null && l.filter);
  $('target').value = rig.layers.some(l => l.id === preferredTarget) ? preferredTarget : wind?.id ?? rig.layers[0].id;
  refreshCutoff(); refreshMaterial(); paintChecks();paintMixer();
}
function paintChecks(){
  $('behavior-checks').replaceChildren();
  for(const check of gameChecks(rig)){const item=document.createElement('p');item.dataset.pass=String(check.pass);item.textContent=(check.pass?'Pass · ':'Fail · ')+check.detail;$('behavior-checks').append(item);}
}
function refreshMaterial(){
  const feet=rig?.layers.find(l=>l.id==='footsteps');$('material').disabled=busy||feet?.type!=='sample';
  if(feet?.type==='sample')$('material').value=feet.samples.every(id=>id.startsWith('step_wood_'))?'wood':'concrete';
}
function refreshCutoff() {
  const layer = rig?.layers.find(l => l.id === $('target').value);
  $('locks').textContent = rig ? `${rig.layers.length - 1} other layers stay locked.` : 'All other layers stay locked.';
  $('cutoff').disabled = busy || !layer?.filter;
  const cutoff = layer?.filter?.cutoff;
  $('cutoff-value').textContent = cutoff ? `${Math.round(typeof cutoff === 'number' ? cutoff : Math.max(cutoff.lo, cutoff.hi))} Hz` : 'No filter';
  if (cutoff) $('cutoff').value = Math.min(10000, Math.max(200, typeof cutoff === 'number' ? cutoff : Math.max(cutoff.lo, cutoff.hi)));
}
function showDiff(before, after, target, locks) {
  const a = before.layers.find(l => l.id === target), b = after.layers.find(l => l.id === target);
  const changed = Object.keys(b).filter(key => stableJSON(a[key]) !== stableJSON(b[key]));
  $('diff').hidden = false;
  $('diff').textContent = changed.length ? changed.map(key => `${key}\n${JSON.stringify(a[key])}\n→ ${JSON.stringify(b[key])}`).join('\n\n') + `\n\n${locks.length} locked layers unchanged.` : 'No fields changed.';
}
async function enableAudio() {
  stopPreview();
  const button = $('enable-audio'); button.disabled = true;
  try {
    const started = gameAudio?await gameAudio.start():await player.start();
    if (started) { $('audio-status').textContent = muted ? 'Audio muted' : 'Audio on'; $('mute').disabled = false; $('enable-audio').textContent = 'Stop audio'; }
    return started;
  } finally { button.disabled = false; }
}
function stopAudio() {
  if(gameAudio)gameAudio.interrupt('Audio stopped; capture invalid');else player.stop(); $('audio-status').textContent = 'Audio off'; $('processor-status').textContent = 'Audio thread inactive';
  $('enable-audio').textContent = 'Enable audio'; $('mute').disabled = true;
}
function event(name, intensity) {
  recording?.handle.noteOutcome();
  if(!gameAudio)player?.emit(name, intensity);
  const item = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span');
  time.textContent = ((performance.now() - began) / 1000).toFixed(1) + 's';
  text.textContent = `${name} · intensity ${intensity.toFixed(2)}`; item.append(time, text);
  if ($('events').children.length === 1 && !$('events').querySelector('time')) $('events').replaceChildren();
  $('events').prepend(item); while ($('events').children.length > 8) $('events').lastElementChild.remove();
}
let lastPaint = 0;
function gameState(next) {
  const important = next.phase !== state.phase || next.pickups !== state.pickups;
  state = next;
  if (!important && performance.now() - lastPaint < 70) return; lastPaint = performance.now();
  $('game-progress').textContent = `${state.pickups} / ${state.total ?? 8}`;
  const phase = state.phase ?? 'playing';
  $('game-objective').textContent = phase === 'complete' ? 'All eight masters delivered. Restart to try another mix.' : phase === 'failed' ? 'The rolling press caught you. Restart to try again.' : phase === 'paused' ? 'Game paused. Resume when you’re ready.' : 'Eight records. Three shelves. Watch the rolling press.';
  $('game-pause').textContent = phase === 'paused' ? 'Resume game' : 'Pause game';
  $('game-pause').setAttribute('aria-pressed', String(phase === 'paused'));
  $('game-pause').disabled = busy || replaying || phase === 'complete' || phase === 'failed';
  $('restart').disabled = busy || replaying;
  $('score').textContent = state.score; $('landings').textContent = state.landings; $('pickups').textContent = state.pickups;
  $('position').textContent = `${Math.round(state.x)}, ${Math.round(state.y)}`;
  for (const id of ['speed', 'air', 'grounded', 'alive']) $('binding-' + id).textContent = state[id].toFixed(id === 'speed' || id === 'air' ? 2 : 0);
}
async function exportComponent() {
  if (busy) return;
  const exportedRig = structuredClone(rig),exportedTrace=structuredClone(trace),renderer=projectRuntime;
  busy=true;lockEditing(true);
  try {
    const result = await api('/api/export', {rig: exportedRig,projectDigest,trace:exportedTrace});
    const pcm=renderer.renderTrace(exportedRig,exportedTrace).pcm,canonical=new Uint8Array(pcm.length*4),view=new DataView(canonical.buffer);
    for(let i=0;i<pcm.length;i++)view.setFloat32(i*4,pcm[i],true);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',canonical))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==result.tracePCMHash)throw Error('Export verification mismatch. Current rig retained; no download created.');
    download(result.module, 'text/javascript', 'soundrig-game.mjs');
    $('clean-host').hidden = false; $('clean-host').href = 'exported.html?v=' + result.digest;
    evidence.exportParity={pass:true,samples:pcm.length,digest:result.digest,tracePCMHash:hash,scope:'Browser renderer hash matches an isolated Node import of the exported module; no new browser module import.'};saveEvidence();
    status(`Component exported. ${pcm.length.toLocaleString()} PCM samples matched the isolated export renderer.`);
  } catch (error) { status(error.message, true); }
  finally{busy=false;lockEditing(false);}
}
async function recordWav() {
  await captureRun(3000,true);
}
function installTrace(input,label,provenance={kind:label.startsWith('Synthetic')?'synthetic':'imported',source:label}){trace=validateTrace(rig,input);traceProvenance=provenance;comparisonCache=null;$('trace-source').textContent=label;$('trace-json').value=JSON.stringify(trace,null,2);$('trace-status').textContent=`${(trace.durationMs/1000).toFixed(1)} seconds · ${trace.commands.length} ordered state/event commands.`;}
async function captureRun(durationMs=6000,exportWave=false){
 if(busy)return;stopPreview();busy=true;lockEditing(true);
 if(!gameAudio?.active){busy=false;lockEditing(false);status('Enable audio after an interruption before capturing.',true);return;}
 const outcomes=game.getState();recording={rig:structuredClone(rig),start:performance.now(),handle:gameAudio.capture(durationMs),outcomes:{land:outcomes.landings,pickup:outcomes.pickups,hurt:outcomes.hits??0}};
 const started=recording.start;const timer=setInterval(()=>{$('trace-status').textContent=`Capturing gameplay · ${Math.min(durationMs/1000,(performance.now()-started)/1000).toFixed(1)} / ${durationMs/1000} s. Move and jump.`;},100);
 try{await new Promise(resolve=>setTimeout(resolve,durationMs+5));const captured=recording,finished=captured.handle.finish(),outcomes=game.getState();recording=null;installTrace(finished.trace,'Captured from live game',finished.provenance);captureOutcomes={land:outcomes.landings-captured.outcomes.land,pickup:outcomes.pickups-captured.outcomes.pickup,hurt:(outcomes.hits??0)-captured.outcomes.hurt};for(const key of ['land','pickup','hurt'])$('expect-'+key).value=captureOutcomes[key];
 evidence.capturedTrace={durationMs,commands:trace.commands.length,events:trace.commands.filter(c=>c.type==='event').map(c=>c.event),initial:trace.initial,gameOutcomes:captureOutcomes,mappingID:finished.provenance.mappingID};
 if(exportWave){const rendered=renderTrace(captured.rig,trace);download(wavBytes(rendered.pcm,rendered.sampleRate),'audio/wav','soundrig-gameplay-replay.wav');evidence.wavReplay={samples:rendered.pcm.length,commands:trace.commands.length,summary:rendered.summary};}
 saveEvidence();status('Gameplay trace captured. Replay or compare it with the same inputs.');
 }catch(error){recording?.handle.cancel(error.message);recording=null;$('trace-status').textContent=error.message+' Previous trace retained.';status(error.message,true);}finally{clearInterval(timer);busy=false;lockEditing(false);}
}
function stopPreview(){
 previewEpoch++;
 if(previewSource){const source=previewSource;previewSource=null;source.onended=null;source.stop();source.disconnect();previewGain?.disconnect();previewGain=null;previewContext?.suspend().catch(()=>{});}
 if(replaying)player?.cancelTrace();
 $('stop-preview').disabled=true;
 if(!previewSource&&!player?.node){$('mute').disabled=true;$('audio-status').textContent='Audio off';}
}
async function replayTrace(){
 if(busy)return;stopPreview();busy=true;replaying=true;lockEditing(true);game.pause();
 try{await enableAudio();$('stop-preview').disabled=false;$('trace-status').textContent='Replaying current kit on the audio thread. Live game input is paused.';const summary=await player.playTrace(trace);evidence.traceReplay={pass:true,durationMs:trace.durationMs,summary};saveEvidence();$('trace-status').textContent=`Replay complete · ${summary.commandsApplied} commands · ${summary.eventCommands} event triggers · ${summary.saturatedSamples} overloaded samples.`;
 }catch(error){$('trace-status').textContent=error.message;}finally{replaying=false;busy=false;lockEditing(false);$('stop-preview').disabled=true;if(!document.hidden)game.resume();player.set(bindings(state));}
}
function comparisonPair(){
 if(comparisonCache)return comparisonCache;
 const previous=baseRenderTrace(synthBaseline,trace),current=renderTrace(rig,trace),pair=matchRMS(previous.pcm,current.pcm);
 comparisonCache={...pair,summary:current.summary};
 evidence.comparison={durationMs:trace.durationMs,commands:trace.commands.length,gains:pair.gains,targetRms:pair.targetRms,summary:current.summary,scope:pair.scope};saveEvidence();return comparisonCache;
}
async function listen(which){
 if(busy)return;stopPreview();stopAudio();$('audio-status').textContent='Game audio off';
 const epoch=previewEpoch;
 try{previewContext??=new AudioContext({latencyHint:'interactive'});await previewContext.resume();if(epoch!==previewEpoch)return;const pair=comparisonPair(),pcm=which==='before'?pair.a:pair.b;
 const buffer=previewContext.createBuffer(1,pcm.length,48000);buffer.copyToChannel(pcm,0);const source=previewContext.createBufferSource(),volume=previewContext.createGain();volume.gain.value=Number($('volume').value)/100;
 volume.gain.value=muted?0:Number($('volume').value)/100;
 source.buffer=buffer;source.connect(volume);volume.connect(previewContext.destination);previewSource=source;previewGain=volume;$('stop-preview').disabled=false;$('mute').disabled=false;$('audio-status').textContent=muted?'Preview muted':'Preview playback';
 $('trace-status').textContent=`Listening: ${which==='before'?'previous synthesized baseline':'current sound kit'} · identical trace · RMS matched.`;
 $('comparison-note').textContent=`Whole-clip RMS matched to ${pair.targetRms.toFixed(4)}. Scaling: previous ×${pair.gains[0].toFixed(2)}, current ×${pair.gains[1].toFixed(2)}. This is not LUFS or a preference result.`;
 source.onended=()=>{if(previewSource===source){previewSource=null;previewGain=null;source.disconnect();volume.disconnect();$('stop-preview').disabled=true;$('mute').disabled=!player.node;$('audio-status').textContent=player.node?(muted?'Audio muted':'Audio on'):'Audio off';$('trace-status').textContent='Listening complete. Compare the other version or change the kit.';previewContext.suspend().catch(()=>{});}};source.start();
 }catch(error){if(epoch===previewEpoch)$('trace-status').textContent=error.message;}
}
async function liveCheck() {
  $('live-check').disabled = true;
  const layer = {id: 'probe', type: 'tone', wave: 'sine', frequency: 440, gain: {control: 'level', lo: 0, hi: .2}, pulseHz: 0,
    when: [], event: null, filter: null, envelope: {attack: .003, decay: .1, release: .05}, pitchEnd: 1};
  const probe = new SoundRigPlayer({version: 2, controls: [{id: 'level', min: 0, max: 1}], events: [], master: .4, layers: [layer]}, {monitorGain: 0});
  try {
    $('check-status').textContent = 'Running a muted live audio-thread probe…';
    await probe.start(); await probe.measureControl({level: 0});
    const first = await probe.measureControl({level: 1}), timings = [first.roundTripMs];
    for (let i = 0; i < 8; i++) timings.push((await probe.measureControl({level: i % 2})).roundTripMs);
    if (first.firstSignal < 0 || first.peak === 0) throw Error('The control acknowledgement did not contain a changed signal');
    evidence.liveAudio = {pass: true, runs: timings.length, maxRoundTripMs: Math.max(...timings), medianRoundTripMs: [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)],
      receivedToAppliedFrames: first.frame - first.receivedFrame, blockLength: first.blockLength, sampleRate: first.sampleRate,
      firstSignalIndex: first.firstSignal, firstPeak: first.peak, browserBaseLatency: probe.context.baseLatency ?? null,
      browserOutputLatency: probe.context.outputLatency ?? null, scope: 'Muted live browser worklet; message/ack timing, not speaker latency or a listening assessment.'};
    $('check-status').textContent = `Live audio check PASS: ${evidence.liveAudio.medianRoundTripMs.toFixed(2)} ms median / ${evidence.liveAudio.maxRoundTripMs.toFixed(2)} ms max control acknowledgement (${timings.length} runs).`;
    $('check-results').hidden = false; $('check-results').textContent = JSON.stringify(evidence.liveAudio, null, 2); saveEvidence();
  } catch (error) { $('check-status').textContent = error.message; }
  finally { await probe.dispose(); $('live-check').disabled = false; }
}

function projectData(){
 const name=$('project-name').value.trim();if(!name||name.length>80)throw Error('Give the project a name of1–80 characters.');
 return {...structuredClone(project),name,rig:structuredClone(rig)};
}
function activationUI(){
 const fields=['project-name','clear-mix','quality','target','mix-cue','mix-gain','mix-rate','rig-json','workflow-json','cutoff','trace-json','material'];
 const text=['project-status','project-details','rig-source','layer-count','locks','cutoff-value','workflow-status','mix-status','diff','trace-source','trace-status'];
 const children=['project-assets','target','layers','mix-cue','behavior-checks','workflow-results'];
 return {fields:fields.map(id=>[id,$(id).value,$(id).checked]),text:text.map(id=>[id,$(id).textContent,$(id).hidden]),children:children.map(id=>[id,[...($(id).childNodes??[])]])};
}
function restoreActivationUI(saved){
 for(const [id,nodes]of saved.children)$(id).replaceChildren(...nodes);
 for(const [id,value,checked]of saved.fields){$(id).value=value;$(id).checked=checked;}
 for(const [id,value,hidden]of saved.text){$(id).textContent=value;$(id).hidden=hidden;}
}
async function activateProject(next,protection=null,restoring=null){
 if(busy&&!restoring?.owned)throw Error('Finish the current operation before changing projects.');
 checkedRig(next.rig);busy=true;workspaceEpoch++;lockEditing(true);
 const old={projectRuntime,player,project,rig,projectDigest,trace,traceProvenance,gameplayContract,contractReport,comparisonCache,manualUndo,guard:$('workflow-guard').checked,ui:activationUI()};
 $('project-status').textContent='Preparing sounds and checking a muted audio-thread candidate. Your current project keeps playing.';
 try{
  if(projectLoader.attempts>=8)throw Error('Eight sound/mix versions loaded. Save your project and reload before loading more.');
  const result=await api('/api/project',{project:next});
  let protectedReport=null;
  if(protection){protectedReport=await api('/api/workflow-check',{project:next,contract:protection,bindings:DEFAULT_BINDINGS});if(!protectedReport.pass||protectedReport.projectSHA256!==await digest(next))throw Error('Candidate rejected by saved checks. '+protectedReport.cases.flatMap(c=>c.failures).join('; '));}
  const active=await projectLoader.replace(result.module,next.rig,bindings(state),{
   beforeCommit:restoring?async()=>{const saved=await api('/api/revisions',{action:'save',label:'Before restore · '+restoring.label.slice(0,60),snapshot:restoring.recovery});restoring.recoveryID=saved.revision.id;}:undefined,
   commit(candidate){
    projectRuntime=candidate.runtime;player=candidate.player;project=structuredClone(next);projectDigest=result.digest;
    player.setMonitorGain(muted?0:Number($('volume').value)/100);
    player.onmessage=message=>{if(message.type==='meter')$('processor-status').textContent=`Audio thread · ${(message.rms*100).toFixed(2)}% RMS · ${message.voices} event voices`;if(message.type==='error'){gameAudio?.interrupt(message.message);status(message.message,true);$('enable-audio').textContent='Enable audio';}};
    install(next.rig,'Project / '+next.name,undefined,{transactional:true,paintOnly:true});
    $('project-name').value=next.name;$('clear-mix').checked=next.clearMix;$('quality').value=next.quality??'classic';
    $('project-status').textContent=`${result.report.importedSlots.length} custom sound slots · cue focus ${next.clearMix?'on':'off'} · ${result.report.exportBytes.toLocaleString()} byte component. Project loaded; playback stopped for activation.`;
    $('project-details').textContent=JSON.stringify(result.report,null,2);
    $('project-assets').replaceChildren();for(const [id,asset]of Object.entries(result.report.assets)){const item=document.createElement('li');item.textContent=`${id.replaceAll('_',' ')} → ${asset.title} · ${asset.sampleRate/1000} kHz`;$('project-assets').append(item);}
    if(restoring){
     trace=restoring.snapshot.trace;traceProvenance=restoring.snapshot.traceProvenance;
     $('trace-json').value=JSON.stringify(trace,null,2);$('trace-source').textContent='Restored revision · '+restoring.label;
     $('trace-status').textContent=`${trace.durationMs/1000} seconds · ${trace.commands.length} ordered state/event commands.`;
     gameplayContract=protection??restoring.snapshot.contract??{version:1,requiredEvents:['land','pickup','hurt'],cases:[]};
     $('workflow-json').value=JSON.stringify(gameplayContract,null,2);$('workflow-guard').checked=protection?true:restoring.snapshot.protection;
     contractReport=null;paintContract();$('workflow-status').textContent='UNCHECKED · Revision restored. '+(protection?'Current protected check definitions retained. ':'Saved check definitions restored. ')+'Run saved checks again.';
    }else if(protectedReport){contractReport=protectedReport;paintContract();$('workflow-status').textContent=`PASS · ${protectedReport.cases.length} saved checks passed before recording activation.`;}
   },
   rollback(){
    ({projectRuntime,player,project,rig,projectDigest,trace,traceProvenance,gameplayContract,contractReport,comparisonCache,manualUndo}=old);
    $('workflow-guard').checked=old.guard;restoreActivationUI(old.ui);
   }
  });
  // Only successful commits may stop playback, revoke previews or dispose old state.
  const warnings=[];for(const cleanup of [stopPreview,clearRecordingReview,stopAudio])try{cleanup();}catch(error){warnings.push(error.message);}
  try{$('project-host').hidden=true;evidence.project={digest:projectDigest,name:next.name,report:result.report,importsThisPage:projectLoader.attempts,cleanupWarning:active.cleanupWarning??warnings.join('; ')};saveEvidence();}catch(error){warnings.push(error.message);}
  if(warnings.length)active.cleanupWarning=[active.cleanupWarning,...warnings].filter(Boolean).join('; ');
  if(active.cleanupWarning)try{$('project-status').textContent+=' Audio cleanup warning: '+active.cleanupWarning+'. Save and reload before further playback.';}catch{}
  return active;
 }catch(error){$('quality').value=project.quality??'classic';$('clear-mix').checked=project.clearMix;$('project-status').textContent=error.message+' Current project retained.';throw error;}
 finally{if(!restoring?.owned){busy=false;lockEditing(false);}}
}
async function importSound(){
 clearRecordingReview();const identity=recordingIdentity();let epoch=recordingStage.epoch;
 try{
  const file=$('sound-file').files[0];if(!file)throw Error('Choose a PCM16 WAV first.');
  const note=$('source-note').value.trim();if(!note)throw Error('Add its source/license note. Ownership is not inferred.');
  if(file.size>409600)throw Error('Choose a WAV no larger than400KiB.');
  $('project-status').textContent='Preparing a preview. Your current sound stays unchanged.';
  epoch=recordingStage.epoch+1;
  const pending=await recordingStage.inspect(async()=>{const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return {filename:file.name,license:note,wav64:btoa(raw)};},asset=>api('/api/review-sound',{asset}),identity,recordingIdentity);
  if(!pending)return;const {review}=pending,r=review.report;
  for(const name of ['original','prepared']){const bytes=Uint8Array.from(atob(review.comparison[name]),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));recordingURLs.push(url);$('recording-'+name+'-audio').src=url;}
  $('recording-destination').textContent=`${file.name} → ${$('sound-slot').selectedOptions[0].textContent}`;
  $('recording-facts').replaceChildren();for(const [label,value]of [['Duration',`${r.sourceSeconds.toFixed(3)}s source → ${r.seconds.toFixed(3)}s prepared`],['Trim',`${Math.round(r.trimmedLeadingSeconds*1000)}ms leading / ${Math.round(r.trimmedTrailingSeconds*1000)}ms trailing`],['Level',`${r.preparationGain.toFixed(2)}× preparation gain · peak ${r.peak.toFixed(3)}`]]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('recording-facts').append(row);}
  $('recording-warnings').replaceChildren();for(const warning of r.warnings){const li=document.createElement('li');li.textContent=warning;$('recording-warnings').append(li);}
  $('recording-review').hidden=false;$('recording-status').textContent='Preview ready. Your current sound is unchanged.';$('project-status').textContent='Preview ready. Listen, then use or discard this recording.';
  evidence.recordingReview={sourceSHA256:r.sourceSHA256,pcmSHA256:r.pcmSHA256,warnings:r.warnings,report:r};saveEvidence();
 }catch(error){if(epoch===recordingStage.epoch&&identity===recordingIdentity())$('project-status').textContent=error.message+' Current project retained.';}
}
function recordingIdentity(){const f=$('sound-file').files[0];return JSON.stringify([f?.name,f?.size,f?.lastModified,$('sound-slot').value,$('source-note').value,$('project-name').value,projectDigest,rig]);}
function stopRecordingAudio(){for(const name of ['original','prepared']){const audio=$('recording-'+name+'-audio');audio.pause();audio.currentTime=0;}}
function clearRecordingReview(){recordingStage.clear();stopRecordingAudio();for(const name of ['original','prepared']){$('recording-'+name+'-audio').removeAttribute('src');$('recording-'+name+'-audio').load();}for(const url of recordingURLs)URL.revokeObjectURL(url);recordingURLs=[];$('recording-review').hidden=true;}
async function hearRecording(name){
 const epoch=recordingStage.epoch;
 try{recordingStage.candidate(recordingIdentity());stopRecordingAudio();stopPreview();stopAudio();await $('recording-'+name+'-audio').play();if(epoch===recordingStage.epoch)$('recording-status').textContent=`Playing ${name}; RMS matched comparison.`;}
 catch(error){if(epoch===recordingStage.epoch)$('recording-status').textContent=error.message;}
}
async function applyRecording(){
 if(busy)return;
 try{const {asset}=recordingStage.candidate(recordingIdentity()),slot=$('sound-slot').value,next=projectData(),protection=guardContract().contract;next.assets[slot]=structuredClone(asset);await activateProject(next,protection);}
 catch(error){$('project-status').textContent=error.message+' Current project retained.';}
}
function paintMixer(){
 const preferred=$('mix-cue').value||'pickup_chime';$('mix-cue').replaceChildren();
 for(const l of rig.layers.filter(l=>l.type==='sample'&&l.event&&typeof l.gain==='number'&&typeof l.rate==='number')){const o=document.createElement('option');o.value=l.id;o.textContent=l.event;$('mix-cue').append(o);}
 if([...$('mix-cue').options].some(o=>o.value===preferred))$('mix-cue').value=preferred;
 refreshMixer();$('mix-undo').disabled=busy||!manualUndo;
}
function refreshMixer(){const l=rig.layers.find(l=>l.id===$('mix-cue').value);$('mix-gain').value=l?.gain??'';$('mix-rate').value=l?.rate??'';}
async function applyCueEdit(undo=false){
 if(busy)return;let before;
 try{
  before=projectData();const beforeJSON=stableJSON(before),runtime=projectRuntime,contract=guardContract().contract;
  if(undo&&(!manualUndo||manualUndo.projectDigest!==projectDigest||manualUndo.expected!==stableJSON(rig)))throw Error('Undo belongs to another sound revision.');
  const next=undo?structuredClone(manualUndo.rig):editCue(rig,$('mix-cue').value,Number($('mix-gain').value),Number($('mix-rate').value));
  busy=true;lockEditing(true);$('mix-status').textContent='Checking the candidate. Your current cue keeps playing.';
  const checked=contract?await checkContract({renderTrace:runtime.renderTrace,validateTrace},next,contract):null;
  if(checked&&!checked.pass)throw Error('Cue edit rejected: '+checked.cases.flatMap(c=>c.failures).join('; '));
  if(runtime!==projectRuntime||beforeJSON!==stableJSON(projectData()))throw Error('Project changed while checking. Try again.');
  install(next,undo?'Manual cue edit undone':'Manual cue edit · saved checks '+(checked?'passed':'not enabled'));
  manualUndo=undo?null:{rig:before.rig,projectDigest,expected:stableJSON(next)};
  if(checked){contractReport=checked;paintContract();$('workflow-status').textContent=`PASS · ${checked.cases.length} checks · local candidate verified before application.`;}
  evidence.manualCue={undo,checks:checked?.cases.length??0,runtimeImports:projectLoader.attempts,runtimeReused:runtime===projectRuntime};saveEvidence();
  $('mix-status').textContent=(undo?'Prior cue settings restored.':'Cue edit applied.')+(checked?` ${checked.cases.length} saved checks passed.`:' Protection was not enabled.');
 }catch(error){$('mix-status').textContent=error.message+' Current cue retained.';}
 finally{busy=false;lockEditing(false);}
}
async function exportProject(){
 if(busy)return;busy=true;lockEditing(true);
 try{const result=await api('/api/project-export',{project:projectData(),trace});const link=document.createElement('a');link.href=result.url;link.download='soundrig-project.zip';link.click();$('project-host').href=result.host;$('project-host').hidden=false;$('project-status').textContent='Project ZIP exported with editable source, sounds, trace, licenses and a plain JavaScript runner.';evidence.projectExport={digest:result.digest,report:result.report};saveEvidence();}
 catch(error){$('project-status').textContent=error.message;}finally{busy=false;lockEditing(false);}
}

function invalidateContract(){contractReport=null;paintContract();if($('workflow-status'))$('workflow-status').textContent=gameplayContract.cases.length?'Sound settings changed. Run saved checks again.':'No saved checks yet.';}
function readContract(){return validateContract({validateTrace},rig,JSON.parse($('workflow-json').value));}
function guardContract(){if(!$('workflow-guard').checked||!gameplayContract.cases.length)return {};return {contract:readContract()};}
function assertContractParity(local,remote){if(local.contractSHA256!==remote.contractSHA256||local.rigSHA256!==remote.rigSHA256||local.pass!==remote.pass||local.cases.length!==remote.cases.length||local.cases.some((c,i)=>c.id!==remote.cases[i].id||c.traceSHA256!==remote.cases[i].traceSHA256||c.pcmSHA256!==remote.cases[i].pcmSHA256))throw Error('Gameplay check identity or PCM mismatch. Current rig retained.');}
async function checkGuardResponse(result,next,contract){if(!contract)return;if(!result.contract?.pass||! /^[a-f0-9]{64}$/.test(result.contract.componentSHA256??''))throw Error('The guarded edit has no verified component identity.');if(projectDigest&&!result.contract.projectSnapshotSHA256?.startsWith(projectDigest))throw Error('The guarded edit used another project snapshot.');const local=await checkContract({renderTrace:projectRuntime.renderTrace,validateTrace},next,contract);assertContractParity(local,result.contract);}
function paintContract(){
 $('workflow-results').replaceChildren();
 for(const c of gameplayContract.cases){const row=document.createElement('li'),measured=contractReport?.cases.find(x=>x.id===c.id),label=document.createElement('span');label.textContent=(measured?(measured.pass?'PASS · ':'FAIL · '):'Unchecked · ')+c.id+' · '+c.provenance.kind+(measured?' · peak '+measured.summary.preLimitPeak.toFixed(3):'');if(measured)label.dataset.pass=String(measured.pass);row.append(label);
  const expected=document.createElement('p');expected.textContent='Expected · '+[['Landings','land'],['Pickups','pickup'],['Damage','hurt']].map(([name,event])=>name+' '+(c.expect.events[event]?.count??'not set')).join(' · ');row.append(expected);
  if(measured?.failures.length){const detail=document.createElement('p');detail.textContent=measured.failures.join('; ');row.append(detail);}
  const button=document.createElement('button');button.textContent='Replay these inputs';button.onclick=()=>{if(busy)return;installTrace(c.trace,c.id,c.provenance);replayTrace();};row.append(document.createElement('br'),button);$('workflow-results').append(row);
 }
 $('workflow-guard').disabled=busy||!gameplayContract.cases.length;
}
function setContract(input){gameplayContract=validateContract({validateTrace},rig,input);$('workflow-json').value=JSON.stringify(gameplayContract,null,2);contractReport=null;paintContract();$('workflow-status').textContent=`${gameplayContract.cases.length} saved checks. Expectations are declared separately from recorded events. Run them against this kit.`;}
async function runContract(){
 if(busy)return;busy=true;lockEditing(true);
 invalidateContract();$('workflow-status').textContent='Checking current sound settings and saved expectations…';
 try{gameplayContract=readContract();const current=projectData(),runtime={renderTrace:projectRuntime.renderTrace,validateTrace},local=await checkContract(runtime,current.rig,gameplayContract);const remote=await api('/api/workflow-check',{project:current,contract:gameplayContract,bindings:DEFAULT_BINDINGS});assertContractParity(local,remote);if(remote.projectSHA256!==await digest(current))throw Error('Project identity changed during checking.');contractReport=remote;paintContract();$('workflow-status').textContent=(contractReport.pass?'PASS':'FAIL')+` · ${contractReport.cases.length} checks · browser/export PCM matched.`+(contractReport.missingEvents.length?' Missing event coverage: '+contractReport.missingEvents.join(', '):'');evidence.gameplayContract=contractReport;saveEvidence();}
 catch(error){$('workflow-status').textContent=error.message;}
 finally{busy=false;lockEditing(false);}
}
async function exportWorkflow(){
 if(busy)return;busy=true;lockEditing(true);
 try{gameplayContract=readContract();const currentProject=projectData(),currentTrace=structuredClone(trace),snapshot=structuredClone(gameplayContract),runtime={renderTrace:projectRuntime.renderTrace,validateTrace};contractReport=await checkContract(runtime,currentProject.rig,snapshot);paintContract();if(!contractReport.pass)throw Error('Saved checks failed. Review the results before exporting.');
  const result=await api('/api/workflow-export',{project:currentProject,trace:currentTrace,contract:snapshot,bindings:DEFAULT_BINDINGS});assertContractParity(contractReport,result.report);if(result.report.projectSHA256!==await digest(currentProject))throw Error('Export project identity changed. No download created.');
  const link=document.createElement('a');link.href=result.url;link.download='soundrig-workflow.zip';link.click();$('workflow-host').href=result.host;$('workflow-host').hidden=false;$('workflow-status').textContent='Verified integration ZIP exported. Run node verify.mjs after later edits; a failed check returns a failing exit code.';evidence.workflowExport={digest:result.digest,report:result.report};saveEvidence();
 }catch(error){$('workflow-status').textContent=error.message;}finally{busy=false;lockEditing(false);}
}
function setupWorkflow(){
 $('workflow-json').value=JSON.stringify(gameplayContract,null,2);$('workflow-bindings').textContent=JSON.stringify(DEFAULT_BINDINGS,null,2);
 $('workflow-example').onclick=async()=>{if(busy)return;const epoch=workspaceEpoch;try{const next=await json('fixtures/workflow-release-contract.json');if(busy||epoch!==workspaceEpoch)return;setContract(next);}catch(error){$('workflow-status').textContent=error.message;}};
 $('workflow-run').onclick=runContract;$('workflow-export').onclick=exportWorkflow;
 $('workflow-add').onclick=()=>{if(busy)return;try{const rules=Object.fromEntries(['land','pickup','hurt'].map(key=>{const count=Number($('expect-'+key).value);return [key,{count,minRMS:count ? .001 : 0}];}));const next={...gameplayContract,cases:[...gameplayContract.cases,{id:$('workflow-name').value.trim(),trace:compactTrace(trace),expect:{events:rules,maxPreLimitPeak:.9,minRMS:0,silence:[]},provenance:traceProvenance}]};setContract(next);}catch(error){$('workflow-status').textContent=error.message+' Existing checks retained.';}};
 $('workflow-remove').onclick=()=>{if(busy)return;gameplayContract.cases.pop();$('workflow-json').value=JSON.stringify(gameplayContract,null,2);invalidateContract();paintContract();};
 $('workflow-save').onclick=()=>{try{download(JSON.stringify(readContract(),null,2),'application/json','soundrig-checks.json');}catch(error){$('workflow-status').textContent=error.message;}};
 $('workflow-json').onchange=()=>{try{setContract(readContract());}catch(error){invalidateContract();$('workflow-status').textContent=error.message+' Fix the JSON before a guarded edit.';}};
 $('workflow-open').onchange=async()=>{const epoch=workspaceEpoch;try{const file=$('workflow-open').files[0];if(!file)return;if(file.size>131072)throw Error('Checks file exceeds128KiB text limit; compact contract must fit32KiB.');const next=JSON.parse(await file.text());if(busy||epoch!==workspaceEpoch)return;setContract(next);}catch(error){$('workflow-status').textContent=error.message+' Existing checks retained.';}finally{$('workflow-open').value='';}};
 paintContract();
}

try {
  manifest = await json('bindings.json'); $('manifest').textContent = JSON.stringify(manifest, null, 2);
  synthBaseline=await json('synth-baseline.json');
  install(await json('hybrid-rig.json'), 'Curated hybrid / Kenney CC0 assets + procedural wind');
  try { const saved = await json('evidence/latest-meta-rig.json'); if (saved.rig) install(saved.rig, `Saved verified Meta output / ${saved.seconds.toFixed(1)} s / ${saved.record}`); } catch {}
  installTrace(await json('example-trace.json'),'Synthetic example trace');
  projectLoader=new ProjectLoader(projectRuntime,player);
  $('import-sound').onclick=importSound;
  for(const id of ['sound-file','sound-slot','source-note','project-name'])$(id).addEventListener(id==='sound-file'||id==='sound-slot'?'change':'input',clearRecordingReview);
  $('recording-original').onclick=()=>hearRecording('original');$('recording-prepared').onclick=()=>hearRecording('prepared');$('recording-stop').onclick=()=>{stopRecordingAudio();$('recording-status').textContent='Comparison stopped.';};
  $('recording-apply').onclick=applyRecording;$('recording-cancel').onclick=()=>{clearRecordingReview();$('project-status').textContent='Preview discarded. Current project retained.';};
  $('mix-cue').onchange=refreshMixer;$('mix-apply').onclick=()=>applyCueEdit();$('mix-undo').onclick=()=>applyCueEdit(true);$('mix-audition').onclick=async()=>{try{stopRecordingAudio();const l=rig.layers.find(l=>l.id===$('mix-cue').value);if(!player.node)await enableAudio();player.emit(l.event,1);}catch(error){$('mix-status').textContent=error.message;}};
  $('project-example').onclick=async()=>{const epoch=workspaceEpoch;try{const [next,checks]=await Promise.all([json('fixtures/studio-example-project.json'),json('fixtures/workflow-release-contract.json')]);validateContract({validateTrace},next.rig,checks);if(busy||epoch!==workspaceEpoch)return;await activateProject(next);setContract(checks);}catch(error){$('project-status').textContent=error.message+' Current project retained.';}};
  $('quick-start').onclick=()=>$('project-example').onclick();
  $('quality').onchange=()=>activateProject({...projectData(),version:2,quality:$('quality').value}).catch(()=>{});
  $('delivery-export').onclick=exportDelivery;
  $('clear-mix').onchange=()=>activateProject({...projectData(),clearMix:$('clear-mix').checked}).catch(()=>{});
  $('project-save').onclick=()=>{try{download(JSON.stringify(projectData(),null,2),'application/json','soundrig-project.json');$('project-status').textContent='Editable project saved, including imported WAV data and source declarations.';}catch(error){$('project-status').textContent=error.message;}};
  $('project-open').onchange=async()=>{const epoch=workspaceEpoch;try{const file=$('project-open').files[0];if(!file)return;if(file.size>4194304)throw Error('Project file exceeds4MiB.');const next=JSON.parse(await file.text());if(busy||epoch!==workspaceEpoch)return;await activateProject(next);}catch(error){$('project-status').textContent=error.message+' Current project retained.';}finally{$('project-open').value='';}};
  $('project-export').onclick=exportProject;
  $('headroom').onclick=()=>{try{const measured=renderTrace(rig,trace).summary;if(!measured.preLimitPeak)throw Error('Capture a non-silent trace first.');if(measured.preLimitPeak<=.65){$('project-status').textContent='This trace already has headroom (pre-limiter peak '+measured.preLimitPeak.toFixed(3)+').';return;}const before=rig.master;install({...rig,master:rig.master*.65/measured.preLimitPeak},'Trace-specific master headroom correction');const after=renderTrace(rig,trace).summary;$('project-status').textContent='Master '+before.toFixed(3)+' → '+rig.master.toFixed(3)+'. Pre-limiter peak '+measured.preLimitPeak.toFixed(3)+' → '+after.preLimitPeak.toFixed(3)+'. Applies to this trace; event balance unchanged.';evidence.headroom={before:measured,after};saveEvidence();}catch(error){$('project-status').textContent=error.message;}};
  const audioProxy={get context(){return player.context;},get node(){return player.node;},set:values=>player.set(values),emit:(name,intensity)=>player.emit(name,intensity),start:()=>player.start(),stop:()=>player.stop(),dispose:()=>player.stop()};
  game = createGame('game', {state: gameState,event,audio:{player:audioProxy,bindings:DEFAULT_BINDINGS,onError:message=>{if(recording)$('trace-status').textContent=message;}},audioReady:audio=>{gameAudio=audio;$('enable-audio').textContent='Enable audio';$('audio-status').textContent='Audio off';}});
  setupWorkflow();
  setupRevisions();
  if(new URLSearchParams(location.search).get('example')==='1')$('project-status').textContent='The working example is ready. Load it with the button above; audio starts only after your gesture.';
  status('Play the current kit, capture a run, or build a verified kit with Meta.');
  $('compile').onclick = () => author('compile'); $('patch').onclick = () => author('patch');
  $('baseline').onclick = async () => { if(busy)return;const epoch=workspaceEpoch;const next=await json('hybrid-rig.json');if(busy||epoch!==workspaceEpoch)return;install(next,'Curated hybrid / Kenney CC0 assets + procedural wind');status('Curated hybrid restored.'); };
  $('material').onchange=()=>{if(busy)return;try{const material=$('material').value,target='footsteps',locks=rig.layers.filter(l=>l.id!==target).map(l=>l.id),before=rig;const next=applyPatch(rig,{layerId:target,changes:{samples:['step_'+material+'_a','step_'+material+'_b']}},locks);install(next,'Manual footstep mapping / '+material,target);showDiff(before,next,target,locks);status('Footstep samples changed. Other layers preserved.');}catch(error){status(error.message,true);}};
  $('capture-trace').onclick=()=>captureRun();$('replay-trace').onclick=replayTrace;$('stop-preview').onclick=()=>{stopPreview();$('trace-status').textContent='Playback stopped.';};
  $('listen-before').onclick=()=>listen('before');$('listen-after').onclick=()=>listen('after');
  $('trace-wav').onclick=()=>{try{const pair=comparisonPair();download(wavBytes(pair.b,48000),'audio/wav','soundrig-current-matched.wav');}catch(error){status(error.message,true);}};
  $('import-trace').onclick=()=>{if(busy)return;try{if($('trace-json').value.length>131072)throw Error('Trace text exceeds128KiB');const next=JSON.parse($('trace-json').value);installTrace(next,'Imported trace');status('Trace validated.');}catch(error){status(error.message+' Current trace retained.',true);}};
  $('download-trace').onclick=()=>download(JSON.stringify(trace,null,2),'application/json','soundrig-trace.json');$('example-trace').onclick=async()=>{const epoch=workspaceEpoch;const next=await json('example-trace.json');if(!busy&&epoch===workspaceEpoch)installTrace(next,'Synthetic example trace');};
  $('target').onchange = refreshCutoff;
  $('enable-audio').onclick = async () => { try { if (player.node) stopAudio(); else await enableAudio(); } catch (error) { status(error.message, true); } };
  $('mute').onclick = () => { muted = !muted;const level=muted?0:Number($('volume').value)/100;player.setMonitorGain(level);previewGain?.gain.setTargetAtTime(level,previewContext.currentTime,.01);$('mute').textContent=muted?'Unmute':'Mute';$('audio-status').textContent=muted?'Audio muted':previewSource?'Preview playback':'Audio on'; };
  $('volume').oninput = () => { if (!muted) {const level=Number($('volume').value)/100;player.setMonitorGain(level);previewGain?.gain.setTargetAtTime(level,previewContext.currentTime,.01);} };
  $('restart').onclick = () => { if(busy||replaying)return; stopPreview();stopAudio();game.restart(); $('events').replaceChildren(); };
  $('game-pause').onclick = () => { if(busy||replaying)return; game.togglePause(); if(game.getState().phase === 'paused')stopAudio(); };
  $('jump').onclick = () => game.jump();
  for (const button of document.querySelectorAll('[data-hold]')) {
    const hold = pressed => { game.hold(button.dataset.hold, pressed); button.setAttribute('aria-pressed', String(pressed)); };
    button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); hold(true); };
    button.onpointerup = button.onpointercancel = () => hold(false);
    button.onkeydown = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); hold(true); } };
    button.onkeyup = () => hold(false); button.onblur = () => hold(false);
  }
  $('cutoff').oninput = () => {
    if (busy) return;
    const target = $('target').value, layer = rig.layers.find(l => l.id === target), old = layer.filter.cutoff, high = Number($('cutoff').value);
    const cutoff = typeof old === 'number' ? high : {...old, lo: Math.max(60, Math.min(high, old.lo * high / old.hi)), hi: high};
    const locks = rig.layers.filter(l => l.id !== target).map(l => l.id), next = applyPatch(rig, {layerId: target, changes: {filter: {...layer.filter, cutoff}}}, locks);
    const before = rig; rig = checkedRig(next); player.useRig(next); comparisonCache=null;invalidateContract(); $('rig-json').value = JSON.stringify(next, null, 2); refreshCutoff(); showDiff(before, next, target, locks);paintChecks();
    $('rig-source').textContent = 'Manual filter edit / other layers preserved';
  };
  $('apply-json').onclick = () => { try { install(JSON.parse($('rig-json').value), 'Manually edited rig'); status('Rig validated and installed.'); } catch (error) { status(error.message, true); } };
  $('export').onclick = exportComponent;
  $('export-json').onclick = () => download(JSON.stringify(rig, null, 2), 'application/json', 'soundrig-game.json');
  $('export-wav').onclick = recordWav; $('live-check').onclick = liveCheck;
  $('model-toggle').onclick = async () => { try { const result = await api('/api/model-mode', {enabled: !backendEnabled}); backendEnabled = result.enabled; $('model-toggle').textContent = backendEnabled ? 'Disable authoring for offline test' : 'Enable authoring again'; status(backendEnabled ? 'Authoring enabled.' : 'Authoring API disabled. Game playback and component exports remain available.'); } catch (error) { status(error.message, true); } };
  $('model-toggle').disabled=true;
  try{const backend=await json('/api/status');backendEnabled=backend.enabled;$('model-toggle').textContent=backendEnabled?'Disable authoring for offline test':'Enable authoring again';$('model-toggle').disabled=false;}
  catch{$('model-toggle').textContent='Authoring status unavailable';}
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearRecordingReview();stopPreview();stopAudio(); game.pause(); $('audio-status').textContent = 'Paused while hidden'; } else if(!replaying)game.resume(); });
  window.addEventListener('pagehide', () => { clearRecordingReview();stopPreview();previewContext?.close();player.dispose(); game.destroy(); });
} catch (error) { status(error.message, true); }

async function exportDelivery(){
 if(busy)return;busy=true;lockEditing(true);$('delivery-status').textContent='Rendering the current project into static game cues…';
 try{const target=$('delivery-target').value,result=await api(target==='godot'?'/api/godot-export':'/api/delivery',{project:projectData()});const link=document.createElement('a');link.href=result.url;link.download=target==='godot'?'soundrig-godot-cues.zip':'soundrig-game-cues.zip';link.click();$('delivery-host').href=result.host;$('delivery-host').hidden=target==='godot';$('delivery-status').textContent=`${result.manifest.clips.length} cues · ${(result.bytes/1024).toFixed(0)} KiB ZIP · ${result.manifest.quality} playback. `+(target==='godot'?'Extract and open project.godot; read GODOT_README.md for your own game. Static one-shots only.':'Open the included Phaser scene to test the delivered sprite.');evidence.delivery={digest:result.digest,manifest:result.manifest,files:result.files,bytes:result.bytes,target};saveEvidence();}
 catch(error){$('delivery-status').textContent=error.message+' Current project retained. Retry when ready.';}
 finally{busy=false;lockEditing(false);}
}

function revisionSnapshot(){
 const contract=gameplayContract.cases.length?readContract():null;
 return validateSnapshot({version:1,project:projectData(),trace:structuredClone(trace),traceProvenance:structuredClone(traceProvenance),contract,protection:Boolean(contract&&$('workflow-guard').checked)});
}
async function refreshRevisions(){
 revisionList=await api('/api/revisions',{action:'list'});
 $('revision-usage').textContent=`${revisionList.revisions.length} / ${revisionList.maxCount} saved · ${(revisionList.usedBytes/1048576).toFixed(1)} / ${revisionList.maxBytes/1048576} MiB of snapshots. No automatic deletion.`;
 $('revision-list').replaceChildren();
 if(!revisionList.revisions.length){const li=document.createElement('li');li.textContent='No saved revisions yet. Name this version and save a checkpoint.';$('revision-list').append(li);}
 for(const record of revisionList.revisions){
  const li=document.createElement('li'),name=document.createElement('strong'),meta=document.createElement('p'),button=document.createElement('button');
  name.textContent=record.label;meta.textContent=`${record.summary.project} · ${new Date(record.created).toLocaleString()} · ${record.summary.sounds} recordings · ${record.summary.checks} checks`;
  button.textContent='Inspect';button.setAttribute('aria-label','Inspect '+record.label);button.onclick=()=>inspectRevision(record);
  li.append(name,meta,button);$('revision-list').append(li);
 }
}
async function inspectRevision(record){
 if(busy)return;busy=true;lockEditing(true);$('revision-status').textContent='Loading the saved checkpoint. Current sound stays in place.';
 try{
  const snapshot=validateSnapshot((await api('/api/revisions',{action:'load',id:record.id})).snapshot),current=revisionSnapshot();
  selectedRevision={...record,snapshot};$('revision-selected').textContent=record.label;$('revision-differences').replaceChildren();
  const changes=snapshotChanges(current,snapshot);
  for(const [field,before,after]of changes){const row=document.createElement('tr');for(const text of [field,before,after]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}$('revision-differences').append(row);}
  $('revision-no-diff').hidden=changes.length>0;
  const protectedNow=current.protection;
  $('revision-policy').textContent=protectedNow?'Current protection is on: this restore must pass your current checks, and those check definitions stay in place.':'Current protection is off: this revision’s saved check definitions and protection setting will be restored.';
  $('revision-recovery').textContent=`A recovery checkpoint of your current applied project, run and check definitions is saved before replacement (about ${Math.ceil(new TextEncoder().encode(JSON.stringify(current)).length/1024)} KiB). ${8-projectLoader.attempts} sound/mix loads remain on this page. Checks show UNCHECKED after restore. Live game position is not saved.`;
  $('revision-preview').hidden=false;$('revision-delete-confirm').hidden=true;$('revision-selected').tabIndex=-1;$('revision-selected').focus({preventScroll:true});$('revision-selected').scrollIntoView({block:'start',behavior:'auto'});
  $('revision-status').textContent='Checkpoint inspected. Current sound is unchanged.';
 }catch(error){selectedRevision=null;$('revision-preview').hidden=true;$('revision-status').textContent=error.message+' Current work is unchanged.';}
 finally{busy=false;lockEditing(false);}
}
async function saveRevision(){
 if(busy)return;
 let snapshot;try{snapshot=revisionSnapshot();}catch(error){$('revision-status').textContent=error.message;return;}
 busy=true;workspaceEpoch++;lockEditing(true);$('revision-status').textContent='Saving this version on your computer…';
 try{const saved=await api('/api/revisions',{action:'save',label:$('revision-label').value,snapshot});await refreshRevisions();$('revision-status').textContent=`Saved “${saved.revision.label}”. Recordings, settings, selected run and check definitions are included.`;}
 catch(error){$('revision-status').textContent=error.message+' Current work is unchanged.';}
 finally{busy=false;lockEditing(false);}
}
async function restoreRevision(){
 if(busy||!selectedRevision)return;
 const record=selectedRevision;let recovery,protection;
 try{recovery=revisionSnapshot();protection=recovery.protection?recovery.contract:null;}catch(error){$('revision-status').textContent=error.message;return;}
 busy=true;workspaceEpoch++;lockEditing(true);$('revision-status').textContent='Checking the saved version and preparing recovery. Your current sound stays in place.';
 const restoring={owned:true,label:record.label,recovery};let committed=false;
 try{
  restoring.snapshot=validateSnapshot((await api('/api/revisions',{action:'load',id:record.id})).snapshot);
  const capacity=await api('/api/revisions',{action:'list'}),recoveryBytes=new TextEncoder().encode(JSON.stringify(recovery)).length;
  if(capacity.revisions.length>=capacity.maxCount||capacity.usedBytes+recoveryBytes>capacity.maxBytes)throw Error('Revision history is full. Download and remove a saved revision before restoring.');
  const activation=await activateProject(restoring.snapshot.project,protection,restoring);committed=true;restoring.cleanupWarning=activation.cleanupWarning;
  await refreshRevisions();$('revision-preview').hidden=true;selectedRevision=null;
  $('revision-status').textContent=`Restored “${record.label}”. Your previous work is saved as a recovery checkpoint. See Saved checks below for current verification results. Re-export to deliver this version.`+(restoring.cleanupWarning?' Audio cleanup warning: '+restoring.cleanupWarning+'. Save and reload before further playback.':'');
 }catch(error){$('revision-status').textContent=committed?'Revision restored, but the history list could not refresh. Use Refresh revisions. '+error.message:error.message+' Current project retained.'+(restoring.recoveryID?' The recovery checkpoint was also retained.':'');}
 finally{busy=false;lockEditing(false);}
}
function setupRevisions(){
 $('revision-save').onclick=saveRevision;
 $('revision-refresh').onclick=async()=>{if(busy)return;try{await refreshRevisions();$('revision-status').textContent='History refreshed. Inspect a checkpoint before restoring.';}catch(error){$('revision-status').textContent=error.message;}};
 $('revision-restore').onclick=restoreRevision;
 $('revision-download').onclick=()=>{if(!selectedRevision||busy)return;download(JSON.stringify({format:'soundrig-revision',label:selectedRevision.label,snapshot:selectedRevision.snapshot},null,2),'application/json','soundrig-revision.json');$('revision-status').textContent='Portable revision downloaded. It includes original recordings and source notes.';};
 $('revision-import').onchange=async()=>{
  if(busy)return;const file=$('revision-import').files[0];if(!file)return;const epoch=workspaceEpoch;let owns=false;
  try{
   if(file.size>5242880)throw Error('Revision file exceeds 5 MiB.');
   const item=JSON.parse(await file.text());if(busy||epoch!==workspaceEpoch)return;
   if(!item||Object.keys(item).sort().join(',')!=='format,label,snapshot'||item.format!=='soundrig-revision')throw Error('Choose a SoundRig revision JSON download.');
   const snapshot=validateSnapshot(item.snapshot);busy=true;owns=true;workspaceEpoch++;lockEditing(true);
   await api('/api/revisions',{action:'save',label:item.label,snapshot});await refreshRevisions();$('revision-status').textContent='Revision imported into local history. Inspect it before restoring; current work is unchanged.';
  }catch(error){if(owns||epoch===workspaceEpoch)$('revision-status').textContent=error.message+' Current work is unchanged.';}
  finally{if(owns||epoch===workspaceEpoch)$('revision-import').value='';if(owns){busy=false;lockEditing(false);}}
 };
 $('revision-remove').onclick=()=>{if(selectedRevision&&!busy){$('revision-delete-label').textContent=selectedRevision.label;$('revision-delete-confirm').hidden=false;}};
 $('revision-cancel-remove').onclick=()=>{$('revision-delete-confirm').hidden=true;};
 $('revision-confirm-remove').onclick=async()=>{
  if(busy||!selectedRevision)return;busy=true;lockEditing(true);
  try{await api('/api/revisions',{action:'remove',id:selectedRevision.id});selectedRevision=null;$('revision-preview').hidden=true;$('revision-delete-confirm').hidden=true;await refreshRevisions();$('revision-status').textContent='Saved revision removed. Current sound is unchanged.';}
  catch(error){$('revision-status').textContent=error.message;}
  finally{busy=false;lockEditing(false);}
 };
 refreshRevisions().then(()=>{if(!busy)$('revision-status').textContent='Local history ready. Inspect a checkpoint or save the current version.';}).catch(error=>{$('revision-status').textContent='Local history unavailable: '+error.message;});
}

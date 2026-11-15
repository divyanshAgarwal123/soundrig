import {SAMPLE_PACK, getSample, MIX_SETTINGS} from './samples.mjs';
// Shared, bounded DSP: the worklet and offline exports execute this same code.
export const LIMITS = Object.freeze({layers: 6, controls: 6, eventVoices: 12, seconds: 10});
const ID = /^[a-z][a-z0-9_]{0,39}$/;
function number(x, low, high, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < low || x > high) throw Error(`Invalid ${name}`);
  return x;
}
function object(x, allowed) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !allowed.includes(k))) throw Error('Unsupported fields');
}
export function stableJSON(x) {
  if (Array.isArray(x)) return '[' + x.map(stableJSON).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stableJSON(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export function validateRig(input) {
  object(input, ['version', 'controls', 'events', 'layers', 'master']);
  if (![2, 3].includes(input.version)) throw Error('Rig version 2 or 3 required');
  if (!Array.isArray(input.controls) || !input.controls.length || input.controls.length > LIMITS.controls) throw Error('One to six controls required');
  const ids = new Set();
  for (const c of input.controls) {
    object(c, ['id', 'min', 'max']);
    if (typeof c.id !== 'string' || !ID.test(c.id) || ids.has(c.id) || c.min !== 0 || c.max !== 1) throw Error('Invalid normalized control');
    ids.add(c.id);
  }
  if (!Array.isArray(input.events) || input.events.length > 8 || new Set(input.events).size !== input.events.length || input.events.some(e => typeof e !== 'string' || !ID.test(e))) throw Error('Invalid event names');
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length > LIMITS.layers) throw Error('One to six layers required');
  const missing=[];
  for(const layer of input.layers){
    if(!layer||typeof layer!=='object'||Array.isArray(layer))continue;
    const required=layer.type==='sample'&&input.version===3?['id','type','gain','pulseHz','when','event','filter','samples','rate','variation']:['id','type','wave','frequency','gain','pulseHz','when','event','filter','envelope','pitchEnd'];
    const fields=required.filter(key=>!Object.hasOwn(layer,key));if(fields.length)missing.push((layer.id??'unnamed')+': '+fields.join(', '));
  }
  if(missing.length)throw Error('Missing required layer fields — '+missing.join('; ')+'. Include pulseHz:0 for one-shots; noise also requires wave:"sine",frequency:200,pitchEnd:1 and its envelope.');
  const binding = (b, low, high, name) => {
    if (typeof b === 'number') return number(b, low, high, name);
    object(b, ['control', 'lo', 'hi']);
    if (!ids.has(b.control)) throw Error(`Unknown control in ${name}`);
    number(b.lo, low, high, name); number(b.hi, low, high, name);
  };
  const layerIDs = new Set();
  for (const l of input.layers) {
    const sampled = l?.type === 'sample' && input.version === 3;
    object(l, sampled ? ['id','type','gain','pulseHz','when','event','filter','samples','rate','variation'] : ['id', 'type', 'wave', 'frequency', 'gain', 'pulseHz', 'when', 'event', 'filter', 'envelope', 'pitchEnd']);
    if (typeof l.id !== 'string' || !ID.test(l.id) || layerIDs.has(l.id)) throw Error('Invalid or duplicate layer id');
    layerIDs.add(l.id);
    if (sampled) {
      if (!Array.isArray(l.samples) || !l.samples.length || l.samples.length > 4 || new Set(l.samples).size !== l.samples.length || l.samples.some(id => !Object.hasOwn(SAMPLE_PACK, id))) throw Error('Choose one to four catalog samples');
      binding(l.rate, .75, 1.25, 'sample rate ratio'); number(l.variation, 0, .05, 'sample variation');
    } else {
      if (!['tone', 'noise'].includes(l.type) || !['sine', 'triangle', 'sawtooth'].includes(l.wave)) throw Error('Invalid sound source');
      binding(l.frequency, 30, 4000, 'frequency');
    }
    binding(l.gain, 0, input.version === 3 ? 1 : .3, 'gain'); binding(l.pulseHz, 0, 12, 'pulseHz');
    if (!Array.isArray(l.when) || l.when.length > 4) throw Error('At most four conditions per layer');
    for (const g of l.when) {
      object(g, ['control', 'op', 'threshold']);
      if (!ids.has(g.control) || !['above', 'below'].includes(g.op)) throw Error('Invalid condition');
      number(g.threshold, 0, 1, 'threshold');
    }
    if (l.event !== null && !input.events.includes(l.event)) throw Error('Undeclared event');
    if (l.filter !== null) {
      object(l.filter, ['type', 'cutoff']);
      if (!['lowpass', 'highpass'].includes(l.filter.type)) throw Error('Invalid filter');
      binding(l.filter.cutoff, 60, 10000, 'filter cutoff');
    }
    if (!sampled) {
      object(l.envelope, ['attack', 'decay', 'release']);
      number(l.envelope.attack, .001, .1, 'attack'); number(l.envelope.decay, .02, .8, 'decay'); number(l.envelope.release, .005, .3, 'release');
      number(l.pitchEnd, .25, 4, 'pitch sweep');
    }
  }
  number(input.master, 0, input.version === 3 ? .8 : .5, 'master gain');
  return JSON.parse(JSON.stringify(input));
}
export function controlsFor(rig, values, prior = {}) {
  object(values, rig.controls.map(c => c.id));
  return Object.fromEntries(rig.controls.map(c => [c.id, number(Object.hasOwn(values, c.id) ? values[c.id] : Object.hasOwn(prior, c.id) ? prior[c.id] : 0, 0, 1, c.id)]));
}
const value = (b, c) => typeof b === 'number' ? b : b.lo + (b.hi - b.lo) * c[b.control];
export function resolveRig(rig, controls) {
  const c = controlsFor(rig, controls);
  return rig.layers.map(l => ({
    id: l.id, frequency: l.type === 'sample' ? 0 : value(l.frequency, c), rate: l.type === 'sample' ? value(l.rate, c) : 1,
    gain: l.when.every(g => g.op === 'above' ? c[g.control] > g.threshold : c[g.control] < g.threshold) ? value(l.gain, c) : 0,
    pulseHz: value(l.pulseHz, c), cutoff: l.filter ? value(l.filter.cutoff, c) : 0,
    event: l.event,
  }));
}
function voice(layer, params, seed) {
  return {layer, params, phase: 0, pulse: 0, gain: 0, frequency: params.frequency, low: 0, age: 0, seed: seed >>> 0, position: -1, wasActive: false};
}
function layerSeed(seed, id) { let hash = seed >>> 0; for (let i=0;i<id.length;i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0; return hash; }
function noise(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 2147483648 - 1;
}
export class DSP {
  constructor(input, sampleRate = 48000, seed = 17, controls = {}) {
    number(sampleRate, 8000, 96000, 'sample rate');
    if (!Number.isInteger(sampleRate) || !Number.isInteger(seed)) throw Error('Integer sample rate and seed required');
    this.sampleRate = sampleRate; this.seed = seed; this.eventCount = 0; this.stolenVoices = 0; this.events = []; this.frame = 0;
    this.streams = new Map(); this.meter = {};
    this.smooth = 1 - Math.exp(-1 / (sampleRate * .005));
    this.duckGain = 1; this.duckHold = 0;
    this.duckAttack = 1-Math.exp(-1/(sampleRate*.008));
    this.duckRelease = 1-Math.exp(-1/(sampleRate*.18));
    this.useRig(input, controls);
  }
  useRig(input, controls = this.controls ?? {}) {
    const rig = validateRig(input);
    if (this.sampleRate < 32000 && rig.layers.some(l => l.type === 'sample')) throw Error('Sample kits require an output sample rate of at least 32000 Hz');
    const kept = Object.fromEntries(rig.controls.map(c => [c.id, Object.hasOwn(controls, c.id) ? controls[c.id] : 0]));
    const nextControls = controlsFor(rig, kept);
    const params = this.parameters(rig, nextControls);
    const old = new Map((this.continuous ?? []).map(s => [s.layer.id, s]));
    this.continuous = rig.layers.filter(l => l.event === null).map((l, i) => {
      const prior = old.get(l.id), p = params.find(x => x.id === l.id);
      return prior && stableJSON(prior.layer) === stableJSON(l) ? prior : voice(l, p, layerSeed(this.seed, l.id));
    });
    this.rig = rig; this.controls = nextControls;
    // An edited event recipe affects future triggers; already sounding voices finish.
    this.setControls(nextControls);
  }
  setControls(values) {
    this.controls = controlsFor(this.rig, values, this.controls);
    const params = this.parameters(this.rig, this.controls);
    for (const s of this.continuous) s.params = params.find(p => p.id === s.layer.id);
  }
  parameters(rig, controls) {
    const params = resolveRig(rig, controls);
    for (const p of params) p.alpha = p.cutoff ? 1 - Math.exp(-2 * Math.PI * Math.min(this.sampleRate * .45, p.cutoff) / this.sampleRate) : 0;
    return params;
  }
  startSample(s, stream) {
    const pool = s.layer.samples, previous = pool.indexOf(stream.last);
    let choice = Math.floor((noise(stream) + 1) / 2 * (pool.length - (previous >= 0 && pool.length > 1 ? 1 : 0)));
    if (previous >= 0 && pool.length > 1 && choice >= previous) choice++;
    choice = Math.min(pool.length - 1, choice); stream.last = pool[choice];
    s.asset = getSample(stream.last); s.position = 0;
    s.ratio = Math.max(.75, Math.min(1.25, s.params.rate * (1 + noise(stream) * s.layer.variation)));
    s.step = s.asset.sampleRate / this.sampleRate * s.ratio;
    s.end = Math.ceil((s.asset.pcm.length - 1) / s.step) + 1; s.age = 0;
    return stream.last;
  }
  stream(id) {
    if (!this.streams.has(id)) this.streams.set(id, {seed: layerSeed(this.seed, id), counter: 0, last: null});
    return this.streams.get(id);
  }
  trigger(event, intensity = 1) {
    if (!this.rig.events.includes(event)) throw Error('Unknown event');
    number(intensity, 0, 1, 'event intensity');
    const params = this.parameters(this.rig, this.controls); let added = 0, stolen = 0; const sampleIDs = [];
    for (const l of this.rig.layers.filter(l => l.event === event)) {
      const p = {...params.find(x => x.id === l.id)}; p.gain *= intensity;
      if (!p.gain) continue;
      if (this.events.length === LIMITS.eventVoices) { this.events.shift(); this.stolenVoices++; stolen++; }
      const stream = this.stream(l.id); stream.counter++; this.eventCount++;
      const s = voice(l, p, layerSeed(this.seed, l.id) + stream.counter * 7919);
      if (l.type === 'sample') sampleIDs.push(this.startSample(s, stream));
      else s.end = Math.round((l.envelope.attack + l.envelope.decay + l.envelope.release) * this.sampleRate);
      this.events.push(s); added++;
    }
    if (MIX_SETTINGS.enabled && added && (event === 'pickup' || event === 'hurt')) this.duckHold = Math.round(this.sampleRate*.2);
    return {added, stolen, sampleIDs};
  }
  sample(s, event = false) {
    const p = s.params, l = s.layer, rate = this.sampleRate;
    s.gain += (p.gain - s.gain) * this.smooth;
    if (s.gain < 1e-9) s.gain = 0;
    let x;
    if (l.type === 'sample') {
      if (!event) {
        if (p.gain > 0 && !s.wasActive) { this.startSample(s, this.stream(l.id)); s.pulse = 0; }
        s.wasActive = p.gain > 0;
        if (p.gain > 0 && p.pulseHz > 0) { s.pulse += p.pulseHz / rate; if (s.pulse >= 1) { s.pulse -= 1; this.startSample(s, this.stream(l.id)); } }
        else s.pulse = 0;
      }
      x = 0;
      if (s.position >= 0 && s.asset && s.position < s.asset.pcm.length - 1) {
        const index = Math.floor(s.position), fraction = s.position - index;
        x = s.asset.pcm[index] + (s.asset.pcm[index + 1] - s.asset.pcm[index]) * fraction;
        s.position += s.step;
      }
      if (event) s.age++;
    } else {
    const sweep = event ? 1 + (l.pitchEnd - 1) * s.age / Math.max(1, s.end - 1) : 1;
    const target = Math.min(rate * .4, p.frequency * sweep);
    s.frequency += (target - s.frequency) * this.smooth;
    s.phase = (s.phase + s.frequency / rate) % 1;
    s.pulse = (s.pulse + p.pulseHz / rate) % 1;
    x = l.type === 'noise' ? noise(s) : l.wave === 'triangle' ? 1 - 4 * Math.abs(s.phase - .5) : l.wave === 'sawtooth' ? 2 * s.phase - 1 : Math.sin(2 * Math.PI * s.phase);
    }
    if (l.filter) {
      s.low += p.alpha * (x - s.low); x = l.filter.type === 'lowpass' ? s.low : x - s.low;
    }
    let envelope = 1;
    if (l.type === 'sample' && s.asset) envelope = Math.max(0, Math.min(1, s.position / s.step / (rate * .002), (s.asset.pcm.length - 1 - s.position) / s.step / (rate * .002)));
    if (event && l.type !== 'sample') {
      const t = s.age / rate, a = l.envelope.attack, d = l.envelope.decay, r = l.envelope.release;
      envelope = t < a ? t / a : t < a + d ? Math.exp(-3 * (t - a) / d) : Math.exp(-3) * Math.max(0, (s.end - 1 - s.age) / (r * rate));
      s.age++;
    }
    const pulse = event || l.type === 'sample' || p.pulseHz === 0 ? 1 : Math.max(0, Math.sin(2 * Math.PI * s.pulse)) ** 4;
    return x * s.gain * envelope * pulse;
  }
  process(output, offset = 0, length = output.length - offset) {
    let peak = 0, square = 0, firstSignal = -1, preLimitPeak = 0, saturatedSamples = 0;
    for (let i = offset; i < offset + length; i++) {
      let sum = 0;
      for (const s of this.continuous) sum += this.sample(s);
      if (MIX_SETTINGS.enabled) {
        const target = this.duckHold > 0 ? .28 : 1;
        this.duckGain += (target-this.duckGain)*(target < this.duckGain ? this.duckAttack : this.duckRelease);
        this.duckHold = Math.max(0,this.duckHold-1); sum *= this.duckGain;
      }
      for (const s of this.events) if (s.age < s.end) sum += this.sample(s, true);
      const pre = sum * this.rig.master; preLimitPeak = Math.max(preLimitPeak, Math.abs(pre)); if (Math.abs(pre) > 1) saturatedSamples++;
      const x = .8 * Math.tanh(pre); output[i] = x;
      peak = Math.max(peak, Math.abs(x)); square += x * x;
      if (firstSignal < 0 && Math.abs(x) > 1e-7) firstSignal = i - offset;
    }
    let kept = 0; for (const s of this.events) if (s.age < s.end) this.events[kept++] = s; this.events.length = kept; this.frame += length;
    return Object.assign(this.meter, {peak, rms: Math.sqrt(square / Math.max(1,length)), firstSignal, voices: kept, stolen: this.stolenVoices, preLimitPeak, saturatedSamples});
  }
}
export function renderPCM(input, controls, {seconds = 1, sampleRate = 48000, seed = 17, commands = [], blockSize = 128} = {}) {
  number(seconds, .01, LIMITS.seconds, 'render duration'); number(blockSize, 1, 4096, 'block size');
  if (!Number.isInteger(blockSize) || !Array.isArray(commands) || commands.length > 1200) throw Error('Invalid offline commands');
  const dsp = new DSP(input, sampleRate, seed, controls), count = Math.round(seconds * sampleRate), output = new Float32Array(count);
  const ordered = commands.map((c, i) => {
    object(c, ['frame', 'type', 'controls', 'event', 'intensity']);
    number(c.frame, 0, count, 'command frame');
    if (!Number.isInteger(c.frame) || !['controls', 'event'].includes(c.type)) throw Error('Invalid command');
    if (c.type === 'controls') {
      if ('event' in c || 'intensity' in c) throw Error('Mixed command types');
      controlsFor(dsp.rig, c.controls);
    } else {
      if ('controls' in c || !dsp.rig.events.includes(c.event)) throw Error('Invalid event command');
      number(Object.hasOwn(c, 'intensity') ? c.intensity : 1, 0, 1, 'event intensity');
    }
    return {...c, order: i};
  }).sort((a, b) => a.frame - b.frame || a.order - b.order);
  let cursor = 0, index = 0;
  while (cursor < count) {
    while (index < ordered.length && ordered[index].frame === cursor) {
      const c = ordered[index++];
      if (c.type === 'controls') dsp.setControls(c.controls); else dsp.trigger(c.event, Object.hasOwn(c, 'intensity') ? c.intensity : 1);
    }
    const end = Math.min(count, cursor + blockSize, ordered[index]?.frame ?? count);
    dsp.process(output.subarray(cursor, end)); cursor = end;
  }
  return {pcm: output, sampleRate};
}
export function applyPatch(input, patch, lockedIDs = []) {
  const rig = validateRig(input);
  if (!Array.isArray(lockedIDs) || new Set(lockedIDs).size !== lockedIDs.length || lockedIDs.some(id => !rig.layers.some(l => l.id === id))) throw Error('Invalid locked layers');
  object(patch, ['layerId', 'changes']);
  if (!rig.layers.some(l => l.id === patch.layerId) || lockedIDs.includes(patch.layerId)) throw Error('Choose an unlocked layer');
  object(patch.changes, ['frequency', 'gain', 'pulseHz', 'when', 'filter', 'envelope', 'pitchEnd', 'wave', 'samples', 'rate', 'variation']);
  if (!Object.keys(patch.changes).length) throw Error('Empty patch');
  const next = JSON.parse(JSON.stringify(rig));
  Object.assign(next.layers.find(l => l.id === patch.layerId), patch.changes);
  validateRig(next);
  for (const id of lockedIDs) if (stableJSON(next.layers.find(l => l.id === id)) !== stableJSON(rig.layers.find(l => l.id === id))) throw Error('Locked layer changed');
  return next;
}
export function validateTrace(rig, input) {
  object(input, ['version', 'durationMs', 'initial', 'commands']);
  if (input.version !== 1 || JSON.stringify(input).length > 131072) throw Error('Trace schema1, at most128KiB required');
  number(input.durationMs, 100, 10000, 'trace duration');
  const initial = controlsFor(rig, input.initial);
  if (Object.keys(input.initial).length !== rig.controls.length) throw Error('Trace initial state must provide every control');
  if (!Array.isArray(input.commands) || input.commands.length > 1200) throw Error('At most1200 trace commands');
  let previous = 0;
  for (const command of input.commands) {
    object(command, ['atMs', 'type', 'controls', 'event', 'intensity']);
    number(command.atMs, 0, input.durationMs, 'trace command time');
    if (command.atMs < previous || command.atMs >= input.durationMs) throw Error('Trace commands must be ordered and before the end');
    previous = command.atMs;
    if (command.type === 'controls') {
      if ('event' in command || 'intensity' in command) throw Error('Mixed trace command');
      controlsFor(rig, command.controls);
    } else if (command.type === 'event') {
      if ('controls' in command || !rig.events.includes(command.event)) throw Error('Undeclared trace event');
      number(Object.hasOwn(command, 'intensity') ? command.intensity : 1, 0, 1, 'trace event intensity');
    } else throw Error('Invalid trace command');
  }
  return {...JSON.parse(JSON.stringify(input)), initial};
}
export class TracePlayer {
  constructor(rig, input, sampleRate = 48000, seed = 17) {
    const trace = validateTrace(rig, input);
    this.dsp = new DSP(rig, sampleRate, seed, trace.initial);
    this.count = Math.round(trace.durationMs * sampleRate / 1000); this.frame = 0; this.index = 0;
    this.commands = trace.commands.map(c => ({...c, frame: Math.min(this.count - 1, Math.round(c.atMs * sampleRate / 1000))}));
    this.summary = {commandsApplied: 0, eventCommands: 0, addedVoices: 0, peak: 0, preLimitPeak: 0, saturatedSamples: 0};
    this.meter = {peak: 0, rms: 0, firstSignal: -1, voices: 0, stolen: 0};
  }
  process(output) {
    let offset = 0;
    output.fill(0);
    while (offset < output.length && this.frame < this.count) {
      while (this.index < this.commands.length && this.commands[this.index].frame === this.frame) {
        const c = this.commands[this.index++]; this.summary.commandsApplied++;
        if (c.type === 'controls') this.dsp.setControls(c.controls);
        else { this.summary.eventCommands++; this.summary.addedVoices += this.dsp.trigger(c.event, Object.hasOwn(c, 'intensity') ? c.intensity : 1).added; }
      }
      const end = Math.min(this.count, this.frame + output.length - offset, this.commands[this.index]?.frame ?? this.count);
      const length = end - this.frame;
      const measured = this.dsp.process(output, offset, length);
      this.summary.preLimitPeak = Math.max(this.summary.preLimitPeak, measured.preLimitPeak); this.summary.saturatedSamples += measured.saturatedSamples;
      for (let i=0;i<length;i++) output[offset+i] *= Math.min(1, Math.max(0, (this.count - 1 - this.frame - i) / (this.dsp.sampleRate * .005)));
      offset += length; this.frame = end;
    }
    let square = 0, peak = 0, firstSignal = -1;
    for (let i=0;i<output.length;i++) { const x=output[i]; square+=x*x; peak=Math.max(peak,Math.abs(x)); if (firstSignal<0&&Math.abs(x)>1e-7) firstSignal=i; }
    this.summary.peak=Math.max(this.summary.peak,peak);
    return Object.assign(this.meter,{peak,rms:Math.sqrt(square/output.length),firstSignal,voices:this.dsp.events.length,stolen:this.dsp.stolenVoices});
  }
  get done() { return this.frame >= this.count; }
}
export function renderTrace(rig, trace, {sampleRate = 48000, blockSize = 128, seed = 17} = {}) {
  number(blockSize,1,4096,'block size'); if(!Number.isInteger(blockSize)) throw Error('Integer block size required');
  const player = new TracePlayer(rig, trace, sampleRate, seed), pcm = new Float32Array(player.count);
  for (let frame=0;frame<pcm.length;frame+=blockSize) player.process(pcm.subarray(frame, Math.min(frame+blockSize,pcm.length)));
  return {pcm,sampleRate,summary:player.summary};
}
export function matchRMS(a, b) {
  const stats = pcm => { let square=0,peak=0; for (const x of pcm) { if(!Number.isFinite(x)) throw Error('Nonfinite comparison audio'); square+=x*x;peak=Math.max(peak,Math.abs(x)); } return {rms:Math.sqrt(square/pcm.length),peak}; };
  const x=stats(a),y=stats(b); if(!a.length||a.length!==b.length||x.rms<1e-8||y.rms<1e-8) throw Error('Comparison requires two non-silent, equal-length traces');
  const safety=Math.min(1,.7/(x.peak*.05/x.rms),.7/(y.peak*.05/y.rms));
  const gains=[.05/x.rms*safety,.05/y.rms*safety];
  return {a:Float32Array.from(a,v=>v*gains[0]),b:Float32Array.from(b,v=>v*gains[1]),gains,targetRms:.05*safety,scope:'Whole-clip RMS matching with a shared0.7 sample-peak ceiling; not perceptual loudness or a preference result.'};
}
export function wavBytes(pcm, sampleRate) {
  if (!(pcm instanceof Float32Array) || pcm.length > sampleRate * LIMITS.seconds) throw Error('Invalid PCM');
  number(sampleRate, 8000, 96000, 'WAV sample rate');
  if(!Number.isInteger(sampleRate))throw Error('Integer WAV sample rate required');
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, b.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const sample=number(pcm[i], -Math.fround(.8), Math.fround(.8), 'PCM sample');v.setInt16(44 + i * 2, Math.round(Math.max(-.8,Math.min(.8,sample)) * 32767), true); }
  return b;
}

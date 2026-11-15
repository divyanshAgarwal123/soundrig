import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {DSP, validateRig, renderPCM, applyPatch, stableJSON, resolveRig, controlsFor} from './core.mjs';
import {bundleModule} from './bundle.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const rig = validateRig(read('baseline-rig.json'));
const rest = {speed: 0, air: 0, grounded: 1, alive: 1};
const active = {speed: 1, air: .7, grounded: 1, alive: 1};
const results = [];
const test = (name, fn) => { fn(); results.push({name, pass: true}); };
test('rest is exactly silent before any events', () => assert(renderPCM(rig, rest).pcm.every(x => x === 0)));
test('run, airborne and death conditions use actual bindings', () => {
  const gains = c => resolveRig(rig, c).filter(l => !l.event);
  assert(gains(active).find(l => l.id === 'footsteps').gain > 0);
  assert.equal(gains({...active, grounded: 0}).find(l => l.id === 'footsteps').gain, 0);
  assert(gains({...active, grounded: 0}).find(l => l.id === 'wind').gain > 0);
  assert(gains({...active, alive: 0}).every(l => l.gain === 0));
});
test('one landing is finite and never retriggers from steady controls', () => {
  const dsp = new DSP(rig, 48000, 17, rest);
  assert.equal(dsp.trigger('land', .8).added, 1);
  const out = new Float32Array(24000); dsp.process(out);
  const layer = rig.layers.find(l => l.event === 'land');
  const end = Math.round((layer.envelope.attack + layer.envelope.decay + layer.envelope.release) * 48000);
  assert(out.some(x => Math.abs(x) > .001)); assert(out.subarray(end).every(x => x === 0));
  assert.equal(dsp.events.length, 0);
  const later = new Float32Array(4800); dsp.process(later); assert(later.every(x => x === 0));
});
test('bounded overlap reports deterministic oldest voice stealing', () => {
  const dsp = new DSP(rig, 48000, 17, rest);
  for (let i = 0; i < 30; i++) dsp.trigger('pickup');
  assert.equal(dsp.events.length, 12); assert.equal(dsp.stolenVoices, 18);
  assert.throws(() => dsp.trigger('missing')); assert.throws(() => dsp.trigger('land', NaN));
});
const commands = [{frame: 64, type: 'controls', controls: active}, {frame: 500, type: 'event', event: 'land', intensity: .9},
  {frame: 2000, type: 'event', event: 'pickup'}, {frame: 4000, type: 'controls', controls: {...active, grounded: 0}},
  {frame: 9000, type: 'controls', controls: {...rest, alive: 0}}, {frame: 9100, type: 'event', event: 'hurt'}];
const reference = renderPCM(rig, rest, {commands, blockSize: 128}).pcm;
test('PCM is independent of block partition and command boundaries', () => {
  for (const blockSize of [1, 63, 127, 509, 1024]) {
    assert.deepEqual(renderPCM(rig, rest, {commands, blockSize}).pcm, reference);
  }
});
test('finite bounded output across supported sample rates', () => {
  for (const sampleRate of [8000, 24000, 48000, 96000]) {
    const out = renderPCM(rig, active, {sampleRate, seconds: .25}).pcm;
    assert(out.every(x => Number.isFinite(x) && Math.abs(x) <= .8)); assert(out.some(x => x !== 0));
  }
});
test('filter cutoff changes noise spectrum rather than a cosmetic field', () => {
  const source = structuredClone(rig); source.layers = [source.layers.find(l => l.id === 'wind')];
  const c = {...active, grounded: 0, air: 1};
  const roughness = pcm => {
    let diff = 0, energy = 0;
    for (let i = 1; i < pcm.length; i++) { diff += (pcm[i] - pcm[i - 1]) ** 2; energy += pcm[i] ** 2; }
    return diff / energy;
  };
  source.layers[0].filter.cutoff = 200; const low = renderPCM(source, c).pcm;
  source.layers[0].filter.cutoff = 6000; const high = renderPCM(source, c).pcm;
  assert(roughness(low) < roughness(high) / 2);
});
const locked = rig.layers.filter(l => l.id !== 'wind').map(l => l.id);
const patched = applyPatch(rig, {layerId: 'wind', changes: {filter: {type: 'lowpass', cutoff: 650}}}, locked);
test('selective patch preserves locked data, stems and live voice state', () => {
  for (const id of locked) assert.equal(stableJSON(rig.layers.find(l => l.id === id)), stableJSON(patched.layers.find(l => l.id === id)));
  const stems = r => ({...r, layers: r.layers.filter(l => locked.includes(l.id))});
  assert.deepEqual(renderPCM(stems(rig), active, {commands}).pcm, renderPCM(stems(patched), active, {commands}).pcm);
  const dsp = new DSP(rig, 48000, 17, active); dsp.process(new Float32Array(128));
  const foot = dsp.continuous.find(v => v.layer.id === 'footsteps'), phase = foot.phase;
  dsp.useRig(patched); assert.equal(dsp.continuous.find(v => v.layer.id === 'footsteps'), foot); assert.equal(foot.phase, phase);
  assert.throws(() => applyPatch(rig, {layerId: 'footsteps', changes: {gain: .2}}, locked));
});
test('unsupported or unbounded model fields reject before rendering', () => {
  for (const mutate of [r => r.master = Infinity, r => r.layers[0].gain = .9, r => r.layers[0].filter.cutoff = NaN,
    r => r.layers[0].when[0].control = 'missing', r => r.layers[0].event = 'missing', r => r.layers[0].envelope.decay = 999,
    r => r.layers[0].code = 'anything', r => r.layers[0].id = '__proto__', r => r.layers.push(...Array(6).fill(r.layers[0]))]) {
    const bad = structuredClone(rig); mutate(bad); assert.throws(() => validateRig(bad));
  }
});
test('invalid endpoint commands and invalid locks reject even when no sample consumes them', () => {
  assert.throws(() => renderPCM(rig, rest, {commands: [{frame: 48000, type: 'controls', controls: {speed: NaN}}]}));
  assert.throws(() => renderPCM(rig, rest, {commands: [{frame: 48000, type: 'event', event: 'missing'}]}));
  assert.throws(() => applyPatch(rig, {layerId: 'wind', changes: {gain: .1}}, ['missing']));
});
test('accepted IDs do not read inherited object properties as controls', () => {
  const r = structuredClone(rig); r.controls.push({id: 'constructor', min: 0, max: 1});
  assert.equal(controlsFor(validateRig(r), {}).constructor, 0);
  assert.equal(controlsFor(r, {constructor: .6}).constructor, .6);
  assert.equal(new DSP(r).controls.constructor, 0);
});

// Execute the real processor class, not a replacement audio scheduler.
const saved = Object.fromEntries(['AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentFrame'].map(k => [k, globalThis[k]]));
let Processor;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = {sent: [], postMessage(data) { this.sent.push(data); }}; } };
globalThis.registerProcessor = (_name, Class) => { Processor = Class; };
globalThis.sampleRate = 48000; globalThis.currentFrame = 0;
let latency;
try {
  await import('./worklet.mjs');
  test('actual processor responds on the next block after a received control', () => {
    const processor = new Processor({processorOptions: {rig, controls: rest, seed: 17}});
    let output = new Float32Array(128); processor.process([], [[output]]); assert(output.every(x => x === 0));
    globalThis.currentFrame = 128;
    processor.port.onmessage({data: {type: 'controls', controls: active, seq: 7}});
    output = new Float32Array(128); processor.process([], [[output]]); assert(output.some(x => Math.abs(x) > 1e-7));
    const ack = processor.port.sent.find(m => m.type === 'controlApplied'); assert.equal(ack.seq, 7); assert.equal(ack.firstSignal, 0);
    latency = {receivedToAppliedFrames: ack.frame - ack.receivedFrame, renderQuantumFrames: 128, sampleRate: 48000,
      nextBlockUpperBoundMs: 128 / 48000 * 1000, scope: 'Actual processor callback under a Node worklet harness; excludes browser transport and device output.'};
  });
  const runProcessor = Class => {
    const processor = new Class({processorOptions: {rig, controls: rest, seed: 17}});
    const output = new Float32Array(48000), timeline = [{frame: 128, type: 'controls', controls: active},
      {frame: 512, type: 'event', event: 'pickup', intensity: 1}, {frame: 2048, type: 'event', event: 'land', intensity: .7}];
    for (let frame = 0; frame < output.length; frame += 128) {
      globalThis.currentFrame = frame;
      for (const command of timeline.filter(c => c.frame === frame)) processor.port.onmessage({data: {...command, seq: frame}});
      processor.process([], [[output.subarray(frame, Math.min(frame + 128, output.length))]]);
    }
    return {output, timeline};
  };
  const {output, timeline} = runProcessor(Processor);
  test('real worklet wrapper matches offline commands for 48000 samples', () => assert.deepEqual(output, renderPCM(rig, rest, {commands: timeline}).pcm));
  const source = Object.fromEntries(['core', 'processor', 'player', 'samples'].map(n => [n, fs.readFileSync(new URL(n === 'processor' ? 'worklet.mjs' : n + '.mjs', import.meta.url), 'utf8')]));
  const moduleText = bundleModule(source, rig);
  fs.writeFileSync(new URL('exports/verified-component.mjs', import.meta.url), moduleText);
  const exported = await import(pathToFileURL(new URL('exports/verified-component.mjs', import.meta.url).pathname));
  test('downloadable module imports with a self-contained processor and same PCM', () => {
    assert.deepEqual(exported.renderPCM(exported.preset, rest, {commands}).pcm, reference);
    const player = exported.createPlayer(); assert(player.processorSource.includes('registerProcessor')); assert(!/^import /m.test(player.processorSource));
  });
  await import('data:text/javascript;base64,' + Buffer.from(exported.createPlayer().processorSource).toString('base64'));
  test('actual bundled processor preserves 48000 worklet samples', () => assert.deepEqual(runProcessor(Processor).output, output));
} finally {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
const summary = {pass: true, cases: results.length, results, processorControlPath: latency,
  workletOfflineSamplesCompared: 48000, bundledProcessorSamplesCompared: 48000,
  limitation: 'No browser/device or human listening evidence in these Node checks.'};
fs.writeFileSync(new URL('evidence/core-test.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

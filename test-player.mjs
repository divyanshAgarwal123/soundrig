import fs from 'node:fs';
import assert from 'node:assert/strict';
import {SoundRigPlayer} from './player.mjs';
const rig = JSON.parse(fs.readFileSync(new URL('baseline-rig.json', import.meta.url)));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const contexts = [], nodes = [], results = [];
const saved = {AudioContext: globalThis.AudioContext, AudioWorkletNode: globalThis.AudioWorkletNode};
class Context {
  constructor() {
    contexts.push(this); this.state = 'suspended'; this.currentTime = 0; this.sampleRate=48000; this.destination = {};
    this.module = deferred(); this.moduleCalls = 0; this.resumeCalls = 0;
    this.audioWorklet = {addModule: () => { this.moduleCalls++; return this.module.promise; }};
  }
  async resume() { this.resumeCalls++; this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return {gain: {value: 0, setTargetAtTime() {}}, connect() {}, disconnect() { this.disconnected = true; }}; }
}
class Node {
  constructor() { nodes.push(this); this.port = {sent: [], postMessage(x) { this.sent.push(x); }, close() { this.closed = true; }}; }
  connect() {} disconnect() { this.disconnected = true; }
}
globalThis.AudioContext = Context; globalThis.AudioWorkletNode = Node;
const test = async (name, action) => { await action(); results.push({name, pass: true}); };
try {
  await test('replay suppresses live input, keeps invalid input atomic and ignores stale completion', async()=>{
    const p=new SoundRigPlayer(rig),start=p.start();contexts.at(-1).module.resolve();await start;
    const trace=JSON.parse(fs.readFileSync(new URL('example-trace.json',import.meta.url))),replay=p.playTrace(trace),task=p.traceTask,count=p.node.port.sent.length;
    p.set({speed:.6});assert.equal(p.node.port.sent.length,count);assert.equal(p.emit('pickup'),false);await assert.rejects(p.measureControl({speed:1}),/during replay/);await assert.rejects(p.playTrace(trace),/already running/);assert.throws(()=>p.useRig(rig));assert.equal(p.traceTask,task);
    p.node.port.onmessage({data:{type:'traceEnded',seq:task.seq-1,summary:{}}});assert.equal(p.traceTask,task);
    p.node.port.onmessage({data:{type:'traceEnded',seq:task.seq,summary:{commandsApplied:trace.commands.length}}});assert.equal((await replay).commandsApplied,trace.commands.length);assert.equal(p.traceTask,null);assert.equal(p.node.port.sent.at(-1).controls.speed,.6);await p.dispose();
  });
  await test('stop rejects replay and low sample-rate rig replacement retains old state',async()=>{
    const p=new SoundRigPlayer(rig),start=p.start();contexts.at(-1).module.resolve();await start;
    const old=p.rig;contexts.at(-1).sampleRate=16000;assert.throws(()=>p.useRig(JSON.parse(fs.readFileSync(new URL('hybrid-rig.json',import.meta.url)))),/32000/);assert.equal(p.rig,old);
    contexts.at(-1).sampleRate=48000;const replay=p.playTrace(JSON.parse(fs.readFileSync(new URL('example-trace.json',import.meta.url))));const stopped=assert.rejects(replay,/stopped/);p.stop();await stopped;assert.equal(p.traceTask,null);await p.dispose();
  });
  await test('accepted IDs use own control values during rig replacement', () => {
    const p = new SoundRigPlayer(rig), next = structuredClone(rig);
    next.controls.push({id: 'constructor', min: 0, max: 1}); p.useRig(next);
    assert.equal(p.controls.constructor, 0);
  });
  await test('duplicate starts share one context, module load and connected node', async () => {
    const count=nodes.length,p = new SoundRigPlayer(rig), a = p.start(), b = p.start(), c = contexts.at(-1);
    assert.equal(c.resumeCalls, 1); assert.equal(c.moduleCalls, 1); c.module.resolve();
    assert.equal(await a, true); assert.equal(await b, true); assert.equal(nodes.length, count+1);
    p.stop(); assert(nodes.at(-1).disconnected && nodes.at(-1).port.closed);
    assert.equal(await p.start(), true); assert.equal(c.moduleCalls, 1); await p.dispose();
  });
  await test('stop while the worklet is loading cannot attach late audio', async () => {
    const p = new SoundRigPlayer(rig), start = p.start(), c = contexts.at(-1), count = nodes.length;
    p.stop(); c.module.resolve(); assert.equal(await start, false); assert.equal(nodes.length, count);
    assert.equal(await p.start(), true); await p.dispose();
  });
  await test('immediate restart during a cancelled load starts one new node without duplicate module registration', async () => {
    const p = new SoundRigPlayer(rig), first = p.start(), c = contexts.at(-1), count = nodes.length;
    p.stop(); const restart = p.start(); c.module.resolve();
    assert.equal(await first, false); assert.equal(await restart, true);
    assert.equal(nodes.length, count + 1); assert.equal(c.moduleCalls, 1); await p.dispose();
  });
  await test('dispose during module load cancels and a later start uses a new context', async () => {
    const p = new SoundRigPlayer(rig), start = p.start(), old = contexts.at(-1), count = nodes.length;
    await p.dispose(); old.module.resolve(); assert.equal(await start, false); assert.equal(nodes.length, count);
    const restart = p.start(), next = contexts.at(-1); assert.notEqual(next, old); next.module.resolve();
    assert.equal(await restart, true); await p.dispose();
  });
  await test('failed module loading leaves no node and can be retried', async () => {
    const p = new SoundRigPlayer(rig), first = p.start(), c = contexts.at(-1);
    c.module.reject(Error('module unavailable')); await assert.rejects(first, /module unavailable/); assert.equal(p.node, null);
    c.module = deferred(); const retry = p.start(); c.module.resolve(); assert.equal(await retry, true); await p.dispose();
  });
  await test('stop rejects pending acknowledgements and stale ports cannot update the player', async () => {
    const p = new SoundRigPlayer(rig), start = p.start(); contexts.at(-1).module.resolve(); await start;
    let messages = 0; p.onmessage = () => messages++;
    const old = p.node, oldHandler = old.port.onmessage, ack = p.measureControl({speed: 1});
    assert.throws(() => p.measureControl({speed: 2}), /Invalid speed/); assert.equal(p.waiters.size, 1);
    const checked = assert.rejects(ack, /Audio stopped/); p.stop(); await checked;
    oldHandler({data: {type: 'meter'}}); assert.equal(messages, 0); assert.equal(p.waiters.size, 0); await p.dispose();
  });
  await test('export processor object URL is revoked after success and failure', async () => {
    const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, made = [], revoked = [];
    URL.createObjectURL = () => { const id = 'blob:test-' + made.length; made.push(id); return id; };
    URL.revokeObjectURL = id => revoked.push(id);
    try {
      for (const success of [true, false]) {
        const p = new SoundRigPlayer(rig, {processorSource: 'fixed trusted processor'}), start = p.start(), c = contexts.at(-1);
        if (success) { c.module.resolve(); assert.equal(await start, true); }
        else { c.module.reject(Error('bad module')); await assert.rejects(start); }
        await p.dispose();
      }
      assert.deepEqual(revoked, made);
    } finally { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; }
  });
} finally {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
const evidence = {pass: true, cases: results.length, results, scope: 'Player lifecycle with explicit delayed browser API stubs; not live audio or device validation.'};
fs.writeFileSync(new URL('evidence/player-test.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

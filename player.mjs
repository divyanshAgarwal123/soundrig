import {validateRig, controlsFor, validateTrace} from './core.mjs';

const DEFAULT_PROCESSOR_URL = () => new URL('./worklet.mjs', import.meta.url).href;

export class SoundRigPlayer {
  constructor(input, {processorSource = null, monitorGain = .7} = {}) {
    this.rig = validateRig(input); this.controls = controlsFor(this.rig, {});
    if (typeof monitorGain !== 'number' || !Number.isFinite(monitorGain) || monitorGain < 0 || monitorGain > 1) throw Error('Invalid monitor gain');
    this.processorSource = processorSource; this.monitorGain = monitorGain;
    this.context = null; this.node = null; this.output = null; this.pendingStart = null;
    this.epoch = 0; this.sequence = 0; this.moduleReady = false; this.moduleLoad = null; this.waiters = new Map();
    this.onmessage = () => {};
    this.traceTask = null;
  }
  set(values) {
    this.controls = controlsFor(this.rig, values, this.controls);
    const seq = ++this.sequence;
    if (!this.traceTask) this.node?.port.postMessage({type: 'controls', controls: this.controls, seq});
    return seq;
  }
  emit(event, intensity = 1) {
    if (!this.rig.events.includes(event) || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw Error('Invalid event');
    if (!this.node || this.traceTask) return false;
    this.node.port.postMessage({type: 'event', event, intensity}); return true;
  }
  useRig(input) {
    if (this.traceTask) throw Error('Finish or stop replay before changing the rig');
    const rig = validateRig(input);
    if (this.context && this.context.sampleRate < 32000 && rig.layers.some(l => l.type === 'sample')) throw Error('Sample kits require at least32000Hz output');
    const values = Object.fromEntries(rig.controls.map(c => [c.id, Object.hasOwn(this.controls, c.id) ? this.controls[c.id] : 0]));
    this.rig = rig; this.controls = controlsFor(rig, values);
    this.node?.port.postMessage({type: 'rig', rig});
    this.set(this.controls);
  }
  setMonitorGain(gain) {
    if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw Error('Invalid volume');
    this.monitorGain = gain;
    if (this.output) this.output.gain.setTargetAtTime(gain, this.context.currentTime, .01);
  }
  async start() {
    if (this.node) return true;
    if (this.pendingStart) return this.pendingStart;
    const epoch = ++this.epoch;
    const task = (async () => {
      if (this.context?.state === 'closed') { this.context = null; this.moduleReady = false; this.moduleLoad = null; }
      this.context ??= new AudioContext({latencyHint: 'interactive'});
      const context = this.context;
      if (context.sampleRate < 32000 && this.rig.layers.some(l => l.type === 'sample')) throw Error('Sample kits require at least32000Hz output');
      if (!context.audioWorklet) throw Error('AudioWorklet is unavailable in this browser');
      // Resume inside the originating gesture, before fetching the worklet module.
      let resumeError = null;
      const resumed = context.resume().catch(error => { resumeError = error; });
      if (!this.moduleReady) {
        if (!this.moduleLoad) {
          let blobURL = null;
          const url = this.processorSource ? (blobURL = URL.createObjectURL(new Blob([this.processorSource], {type: 'text/javascript'}))) : DEFAULT_PROCESSOR_URL();
          const load = (async () => {
            try { await context.audioWorklet.addModule(url); if (this.context === context && context.state !== 'closed') this.moduleReady = true; }
            finally { if (blobURL) URL.revokeObjectURL(blobURL); if (this.moduleLoad === load) this.moduleLoad = null; }
          })();
          this.moduleLoad = load;
        }
        await this.moduleLoad;
      }
      if (epoch !== this.epoch) return false;
      await resumed;
      if (epoch !== this.epoch) return false;
      if (resumeError) throw resumeError;
      if (context.state !== 'running') throw Error('Audio did not start; click Enable audio again');
      const node = new AudioWorkletNode(context, 'soundrig-v3', {numberOfInputs: 0, numberOfOutputs: 1,
        outputChannelCount: [1], processorOptions: {rig: this.rig, controls: this.controls, seed: 17}});
      const output = context.createGain(); output.gain.value = this.monitorGain;
      node.port.onmessage = ({data}) => {
        if (this.node !== node) return;
        if (data.type === 'controlApplied') {
          const waiting = this.waiters.get(data.seq);
          if (waiting) { clearTimeout(waiting.timer); this.waiters.delete(data.seq); waiting.resolve({...data, roundTripMs: performance.now() - waiting.sent}); }
        }
        if (data.type === 'traceEnded' && this.traceTask?.seq === data.seq) {
          const task = this.traceTask; this.traceTask = null; clearTimeout(task.timer); this.set(this.controls); task.resolve(data.summary);
        }
        this.onmessage(data);
      };
      node.onprocessorerror = () => { this.stop(); this.onmessage({type: 'error', message: 'Audio processor stopped. Enable audio to recover.'}); };
      this.node = node; this.output = output;
      node.connect(output); output.connect(context.destination); return true;
    })();
    this.pendingStart = task;
    try { return await task; } finally { if (this.pendingStart === task) this.pendingStart = null; }
  }
  measureControl(values) {
    if (!this.node) return Promise.reject(Error('Enable audio first'));
    if (this.traceTask) return Promise.reject(Error('Control measurement unavailable during replay'));
    const checked = controlsFor(this.rig, values, this.controls);
    const seq = this.sequence + 1, sent = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(seq); reject(Error('No audio-thread acknowledgement')); }, 2000);
      this.waiters.set(seq, {resolve, reject, timer, sent}); this.set(checked);
    });
  }
  playTrace(input) {
    if (!this.node) return Promise.reject(Error('Enable audio first'));
    if (this.traceTask) return Promise.reject(Error('A replay is already running'));
    const trace = validateTrace(this.rig, input), seq = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.cancelTrace(); }, trace.durationMs + 5000);
      this.traceTask = {seq, resolve, reject, timer}; this.node.port.postMessage({type: 'trace', trace, seq});
    });
  }
  cancelTrace() {
    const task = this.traceTask; this.traceTask = null;
    if (task) { clearTimeout(task.timer); this.node?.port.postMessage({type: 'cancelTrace'}); task.reject(Error('Replay stopped')); this.set(this.controls); }
  }
  stop() {
    this.epoch++;
    this.pendingStart = null;
    this.cancelTrace();
    if (this.node) {
      this.node.port.postMessage({type: 'stop'}); this.node.disconnect();
      this.node.port.onmessage = null; this.node.port.close(); this.node.onprocessorerror = null;
    }
    this.output?.disconnect(); this.node = null; this.output = null;
    for (const w of this.waiters.values()) { clearTimeout(w.timer); w.reject(Error('Audio stopped')); }
    this.waiters.clear();
  }
  async dispose() {
    this.stop();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.moduleReady = false;
  }
}

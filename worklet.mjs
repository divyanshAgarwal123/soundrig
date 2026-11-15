import {DSP, TracePlayer} from './core.mjs';

class SoundRigProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const {rig, controls = {}, seed = 17} = options.processorOptions;
    this.dsp = new DSP(rig, sampleRate, seed, controls);
    this.rig = this.dsp.rig; this.liveControls = this.dsp.controls; this.seed = seed; this.timeline = null;
    this.maxRenderMs = null;
    this.running = true; this.blocks = 0; this.pending = null;
    this.port.onmessage = ({data}) => {
      try {
        if (data.type === 'controls') {
          this.liveControls = data.controls;
          if (!this.timeline) this.dsp.setControls(data.controls);
          this.pending = {seq: data.seq, receivedFrame: currentFrame};
        } else if (data.type === 'event') {
          if (this.timeline) return;
          const result = this.dsp.trigger(data.event, data.intensity);
          this.port.postMessage({type: 'eventApplied', event: data.event, ...result, frame: currentFrame});
        } else if (data.type === 'rig') {
          if (this.timeline) throw Error('Finish or stop replay before changing the rig');
          this.dsp.useRig(data.rig, this.dsp.controls);
          this.rig = this.dsp.rig;
          this.port.postMessage({type: 'rigApplied', frame: currentFrame});
        } else if (data.type === 'trace') {
          if (this.timeline) throw Error('A replay is already running');
          const timeline = new TracePlayer(this.rig, data.trace, sampleRate, this.seed);
          this.timeline = timeline; this.traceSequence = data.seq;
        } else if (data.type === 'cancelTrace') {
          this.timeline = null; this.dsp = new DSP(this.rig, sampleRate, this.seed, this.liveControls);
        } else if (data.type === 'stop') this.running = false;
      } catch (error) { this.port.postMessage({type: 'error', message: error.message}); }
    };
  }
  process(_inputs, outputs) {
    const channel = outputs[0]?.[0];
    if (!this.running || !channel) { channel?.fill(0); return false; }
    const started = typeof performance !== 'undefined' ? performance.now() : null;
    const meter = this.timeline ? this.timeline.process(channel) : this.dsp.process(channel);
    if (this.timeline?.done) {
      this.port.postMessage({type: 'traceEnded', seq: this.traceSequence, summary: this.timeline.summary, frame: currentFrame});
      this.timeline = null; this.dsp = new DSP(this.rig, sampleRate, this.seed, this.liveControls);
    }
    if (started !== null) this.maxRenderMs = Math.max(this.maxRenderMs ?? 0, performance.now() - started);
    if (this.pending) {
      this.port.postMessage({type: 'controlApplied', ...this.pending, frame: currentFrame,
        sampleRate, blockLength: channel.length, ...meter});
      this.pending = null;
    }
    if (++this.blocks % 24 === 0) this.port.postMessage({type: 'meter', ...meter, frame: currentFrame, sampleRate, maxRenderMs: this.maxRenderMs});
    return true;
  }
}
registerProcessor('soundrig-v3', SoundRigProcessor);

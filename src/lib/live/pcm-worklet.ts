/**
 * The AudioWorklet that turns whatever the browser captures (the microphone, and a call's tab
 * audio mixed in by the graph) into what sotto-api takes: 16 kHz mono signed 16-bit PCM, posted
 * in numbered-sized chunks (~4 s, 128 KB). It runs on the audio thread, so the page's work never
 * drops a sample, and nothing is encoded or decoded on either side.
 *
 * Messages out: `{ type: 'chunk', pcm: ArrayBuffer }` (transferred), `{ type: 'level', level }`
 * about 20 times a second (0–1, for the waveform). Messages in: `'pause'`, `'resume'`, and
 * `'flush'` (send what's buffered now, at Stop).
 *
 * Kept as source text (loaded from a Blob URL) so it needs no separate bundle; test/live.test.ts
 * runs this exact text against a fake worklet scope.
 */
export const PCM_WORKLET_SOURCE = /* js */ `
const TARGET_RATE = 16000;

class SottoPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkMs = (options && options.processorOptions && options.processorOptions.chunkMs) || 4000;
    this.chunk = new Int16Array(Math.round((TARGET_RATE * chunkMs) / 1000));
    this.filled = 0;
    // Downsampling by averaging every input sample that falls in one output sample's window: a
    // simple low-pass, plenty for speech, and cheap.
    this.step = sampleRate / TARGET_RATE;
    this.position = 0; // how far into the current output sample's window we are
    this.sum = 0;
    this.count = 0;
    this.paused = false;
    this.peak = 0;
    this.levelEvery = Math.round(sampleRate / 20);
    this.sinceLevel = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'pause') this.paused = true;
      else if (event.data === 'resume') this.paused = false;
      else if (event.data === 'flush') this.flush();
    };
  }

  flush() {
    if (!this.filled) return;
    const out = this.chunk.slice(0, this.filled);
    this.filled = 0;
    this.port.postMessage({ type: 'chunk', pcm: out.buffer }, [out.buffer]);
  }

  push(value) {
    const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
    this.chunk[this.filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    if (this.filled === this.chunk.length) {
      const out = this.chunk;
      this.chunk = new Int16Array(out.length);
      this.filled = 0;
      this.port.postMessage({ type: 'chunk', pcm: out.buffer }, [out.buffer]);
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const channels = input.length;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let mono = 0;
      for (let c = 0; c < channels; c++) mono += input[c][i];
      mono /= channels;
      const magnitude = mono < 0 ? -mono : mono;
      if (magnitude > this.peak) this.peak = magnitude;
      if (++this.sinceLevel >= this.levelEvery) {
        this.port.postMessage({ type: 'level', level: this.paused ? 0 : this.peak });
        this.peak = 0;
        this.sinceLevel = 0;
      }
      if (this.paused) continue;
      this.sum += mono;
      this.count += 1;
      this.position += 1;
      if (this.position >= this.step) {
        this.push(this.sum / this.count);
        this.position -= this.step;
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }
}

registerProcessor('sotto-pcm', SottoPcm);
`;

export const PCM_WORKLET_NAME = 'sotto-pcm';
/** Bytes of audio a millisecond, as sotto-api counts it (16 kHz × 2 bytes). */
export const BYTES_PER_MS = 32;

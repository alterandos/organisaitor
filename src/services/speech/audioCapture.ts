import { SPEECH_SAMPLE_RATE, SpeechError } from './types';

const FRAME_SAMPLES = SPEECH_SAMPLE_RATE / 20; // 50 ms

// A worklet, not ScriptProcessor (deprecated). Loaded from a Blob so it needs no separate asset
// in the Vite/Tauri build.
const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME_SAMPLES}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

export interface AudioCapture {
  stop: () => void;
}

// Opens the microphone and delivers 50 ms frames of 16 kHz mono float samples. The AudioContext
// is created at 16 kHz so the browser does the resampling.
export async function startAudioCapture(onFrame: (frame: Float32Array) => void): Promise<AudioCapture> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    throw new SpeechError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'mic-unavailable' : 'mic-denied');
  }

  const releaseStream = () => stream.getTracks().forEach((t) => t.stop());
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    releaseStream();
    throw new SpeechError('unavailable');
  }

  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'pcm-tap');
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data);
  // Routed through a muted gain so the graph is pulled (an unconnected node may never process)
  // without playing the mic back through the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);

  return {
    stop: () => {
      tap.port.onmessage = null;
      source.disconnect();
      tap.disconnect();
      releaseStream();
      void ctx.close();
    },
  };
}

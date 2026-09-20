const FRAME_MS = 50;
const PRE_ROLL_FRAMES = 6;          // 300 ms kept before speech starts so the first word isn't clipped
const END_SILENCE_MS = 1400;        // long enough to keep a natural pause inside one request
const MIN_SPEECH_MS = 250;          // shorter blips (a cough, a key click) aren't worth a request
const MAX_UTTERANCE_MS = 50_000;    // Google's synchronous limit is 60 s
const MIN_THRESHOLD = 0.015;
const NOISE_MARGIN = 3;             // speech must be this many times louder than the room

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function toPcm16(frames: Float32Array[]): Int16Array {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const out = new Int16Array(total);
  let o = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      out[o++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  return out;
}

// Energy-based voice-activity detection: groups a stream of 50 ms frames into utterances
// (speech, then a pause). The threshold adapts to the room's noise floor.
export class UtteranceDetector {
  private preRoll: Float32Array[] = [];
  private frames: Float32Array[] = [];
  private inSpeech = false;
  private voicedMs = 0;
  private silenceMs = 0;
  private noiseFloor = 0.005;

  lastVoiceAt = Date.now();

  private onUtterance: (pcm: Int16Array) => void;
  private onLevel: (level: number) => void;

  constructor(onUtterance: (pcm: Int16Array) => void, onLevel: (level: number) => void) {
    this.onUtterance = onUtterance;
    this.onLevel = onLevel;
  }

  push(frame: Float32Array): void {
    const energy = rms(frame);
    this.onLevel(Math.min(1, Math.sqrt(energy / 0.12)));

    const voiced = energy > Math.max(MIN_THRESHOLD, this.noiseFloor * NOISE_MARGIN);
    if (voiced) {
      this.lastVoiceAt = Date.now();
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.frames = [...this.preRoll];
      }
      this.frames.push(frame);
      this.voicedMs += FRAME_MS;
      this.silenceMs = 0;
    } else if (this.inSpeech) {
      this.frames.push(frame);
      this.silenceMs += FRAME_MS;
      if (this.silenceMs >= END_SILENCE_MS) this.finish();
    } else {
      this.noiseFloor = this.noiseFloor * 0.95 + energy * 0.05;
      this.preRoll.push(frame);
      if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
    }

    if (this.inSpeech && this.frames.length * FRAME_MS >= MAX_UTTERANCE_MS) this.finish();
  }

  // Emits whatever speech is in progress (the user stopped mid-sentence).
  flush(): void {
    if (this.inSpeech) this.finish();
  }

  private finish(): void {
    const frames = this.frames;
    const enough = this.voicedMs >= MIN_SPEECH_MS;
    this.frames = [];
    this.preRoll = [];
    this.inSpeech = false;
    this.voicedMs = 0;
    this.silenceMs = 0;
    if (enough) this.onUtterance(toPcm16(frames));
  }
}

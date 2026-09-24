import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UtteranceDetector } from './utteranceDetector';

// Mirrors the module's own private constants (kept here, not imported, since they're
// deliberately not exported — a test coupled to their exact values would defeat the point of
// documenting the *behavior* they produce).
const FRAME_MS = 50;
const PRE_ROLL_FRAMES = 6;
const END_SILENCE_MS = 1400;
const MIN_SPEECH_MS = 250;
const MAX_UTTERANCE_MS = 50_000;

const SILENCE_FRAMES_TO_FINISH = END_SILENCE_MS / FRAME_MS; // 28
const MIN_SPEECH_FRAMES = MIN_SPEECH_MS / FRAME_MS; // 5

function frame(amplitude: number, n = 8): Float32Array {
  return new Float32Array(n).fill(amplitude);
}

describe('UtteranceDetector', () => {
  let onUtterance: ReturnType<typeof vi.fn<(pcm: Int16Array) => void>>;
  let onLevel: ReturnType<typeof vi.fn<(level: number) => void>>;
  let det: UtteranceDetector;

  beforeEach(() => {
    onUtterance = vi.fn();
    onLevel = vi.fn();
    det = new UtteranceDetector(onUtterance, onLevel);
  });

  it('never emits an utterance from silence alone, however long it continues', () => {
    for (let i = 0; i < 200; i++) det.push(frame(0));
    expect(onUtterance).not.toHaveBeenCalled();
  });

  it('a low, steady background noise never triggers voice detection, even as the noise floor adapts to it', () => {
    // Below MIN_THRESHOLD (0.015), so never crosses the voiced gate no matter how the
    // adapting noise floor moves — this is the "quiet room hum" case.
    for (let i = 0; i < 300; i++) det.push(frame(0.01));
    expect(onUtterance).not.toHaveBeenCalled();
  });

  it('calls onLevel once per pushed frame, scaled from energy and clamped to [0, 1]', () => {
    det.push(frame(0)); // energy 0 -> level 0
    det.push(frame(1)); // energy 1, sqrt(1/0.12) > 1 -> clamped to 1
    expect(onLevel).toHaveBeenCalledTimes(2);
    expect(onLevel.mock.calls[0][0]).toBeCloseTo(0);
    expect(onLevel.mock.calls[1][0]).toBe(1);
  });

  it('a blip shorter than MIN_SPEECH_MS is discarded once silence closes it out', () => {
    for (let i = 0; i < MIN_SPEECH_FRAMES - 2; i++) det.push(frame(0.5)); // 150ms of "speech"
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));
    expect(onUtterance).not.toHaveBeenCalled();
  });

  it('a real utterance is emitted once trailing silence reaches END_SILENCE_MS, including pre-roll audio from just before it started', () => {
    // More than PRE_ROLL_FRAMES of silence first, so the pre-roll buffer is full and has
    // dropped the earliest frames by the time speech starts.
    for (let i = 0; i < PRE_ROLL_FRAMES + 4; i++) det.push(frame(0));
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det.push(frame(0.5)); // 300ms, clears the 250ms gate
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));

    expect(onUtterance).toHaveBeenCalledTimes(1);
    const pcm = onUtterance.mock.calls[0][0] as Int16Array;
    // preroll (capped at PRE_ROLL_FRAMES) + speech frames + trailing silence frames (also
    // buffered while inSpeech, since they're what proves the utterance is over).
    const expectedFrames = PRE_ROLL_FRAMES + (MIN_SPEECH_FRAMES + 1) + SILENCE_FRAMES_TO_FINISH;
    expect(pcm.length).toBe(expectedFrames * 8);
  });

  it('converts float samples to 16-bit PCM correctly, clamping out-of-range input on both ends', () => {
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det.push(frame(1.5)); // out of [-1,1] on the positive side
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));
    const pcm = onUtterance.mock.calls[0][0] as Int16Array;
    expect(Array.from(pcm.slice(0, 8))).toEqual(new Array(8).fill(0x7fff));

    onUtterance.mockClear();
    const det2 = new UtteranceDetector(onUtterance, onLevel);
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det2.push(frame(-1.5)); // out of range, negative side
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det2.push(frame(0));
    const pcm2 = onUtterance.mock.calls[0][0] as Int16Array;
    expect(Array.from(pcm2.slice(0, 8))).toEqual(new Array(8).fill(-0x8000));

    onUtterance.mockClear();
    const det3 = new UtteranceDetector(onUtterance, onLevel);
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det3.push(frame(0.5)); // in-range
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det3.push(frame(0));
    const pcm3 = onUtterance.mock.calls[0][0] as Int16Array;
    expect(pcm3[0]).toBe(16383); // Math.trunc(0.5 * 0x7fff)
  });

  it('cuts an utterance off at MAX_UTTERANCE_MS even with no silence, and can start a fresh one right after', () => {
    const framesForMax = MAX_UTTERANCE_MS / FRAME_MS; // 1000
    for (let i = 0; i < framesForMax; i++) det.push(frame(0.5));
    expect(onUtterance).toHaveBeenCalledTimes(1);
    expect((onUtterance.mock.calls[0][0] as Int16Array).length).toBe(framesForMax * 8);

    // State was fully reset by the forced cut, so another utterance can be captured next.
    onUtterance.mockClear();
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det.push(frame(0.5));
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));
    expect(onUtterance).toHaveBeenCalledTimes(1);
  });

  it('flush() emits whatever speech is in progress, without waiting for trailing silence', () => {
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det.push(frame(0.5));
    expect(onUtterance).not.toHaveBeenCalled();
    det.flush();
    expect(onUtterance).toHaveBeenCalledTimes(1);
    expect((onUtterance.mock.calls[0][0] as Int16Array).length).toBe((MIN_SPEECH_FRAMES + 1) * 8);
  });

  it('flush() is a no-op when nothing is in progress', () => {
    for (let i = 0; i < 10; i++) det.push(frame(0));
    det.flush();
    expect(onUtterance).not.toHaveBeenCalled();
  });

  it('flush() still discards a too-short blip, the same MIN_SPEECH_MS gate as a silence-triggered finish', () => {
    for (let i = 0; i < MIN_SPEECH_FRAMES - 2; i++) det.push(frame(0.5));
    det.flush();
    expect(onUtterance).not.toHaveBeenCalled();
  });

  it('lastVoiceAt only advances on voiced frames, not on silence', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      det.push(frame(0.5));
      const afterVoice = det.lastVoiceAt;
      expect(afterVoice).toBe(1_000_000);

      vi.setSystemTime(1_000_500);
      det.push(frame(0));
      expect(det.lastVoiceAt).toBe(afterVoice); // unchanged by the silent frame

      vi.setSystemTime(1_001_000);
      det.push(frame(0.5));
      expect(det.lastVoiceAt).toBe(1_001_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two separate utterances, each preceded by silence, are captured independently with no leftover state', () => {
    for (let i = 0; i < 10; i++) det.push(frame(0));
    for (let i = 0; i < MIN_SPEECH_FRAMES + 1; i++) det.push(frame(0.5));
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));

    for (let i = 0; i < 10; i++) det.push(frame(0));
    for (let i = 0; i < MIN_SPEECH_FRAMES + 3; i++) det.push(frame(0.5)); // a different length this time
    for (let i = 0; i < SILENCE_FRAMES_TO_FINISH; i++) det.push(frame(0));

    expect(onUtterance).toHaveBeenCalledTimes(2);
    const first = onUtterance.mock.calls[0][0] as Int16Array;
    const second = onUtterance.mock.calls[1][0] as Int16Array;
    expect(first.length).not.toBe(second.length);
    expect(first.length).toBe((PRE_ROLL_FRAMES + MIN_SPEECH_FRAMES + 1 + SILENCE_FRAMES_TO_FINISH) * 8);
    expect(second.length).toBe((PRE_ROLL_FRAMES + MIN_SPEECH_FRAMES + 3 + SILENCE_FRAMES_TO_FINISH) * 8);
  });
});

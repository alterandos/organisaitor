export const SPEECH_SAMPLE_RATE = 16000;

export type SpeechErrorCode =
  | 'signed-out'
  | 'limit-reached'
  | 'not-configured'
  | 'unavailable'
  | 'mic-denied'
  | 'mic-unavailable'
  | 'failed';

export class SpeechError extends Error {
  code: SpeechErrorCode;
  constructor(code: SpeechErrorCode) {
    super(code);
    this.code = code;
  }
}

// The one seam for swapping speech-to-text backends (Google today; a local Whisper engine later
// is just another implementation). Audio capture, utterance detection and text insertion don't
// know which engine is in use — they hand it one finished utterance of 16 kHz mono PCM.
export interface SpeechEngine {
  transcribe(pcm: Int16Array, opts: { language: string }): Promise<string>;
}

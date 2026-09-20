import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'starting' | 'listening' | 'finishing' | 'error';

interface VoiceState {
  status:       VoiceStatus;
  transcribing: boolean;   // an utterance is with the speech engine right now
  levels:       number[];  // the last few 0–1 mic loudness readings, drives the indicator's bars
  message:      string | null;   // shown while status is 'error' (also used for plain notices)
}

export const LEVEL_BARS = 7;
export const SILENT_LEVELS: number[] = Array(LEVEL_BARS).fill(0);

// Memory-only, written by src/services/speech/dictation.ts and read by VoiceIndicator.
export const useVoiceStore = create<VoiceState>()(() => ({
  status:       'idle',
  transcribing: false,
  levels:       SILENT_LEVELS,
  message:      null,
}));

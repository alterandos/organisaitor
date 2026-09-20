import { supabase } from '@/services/supabase';
import { useSettingsStore } from '@/store/settingsStore';
import { SILENT_LEVELS, useVoiceStore } from '@/store/voiceStore';
import { LABELS } from '@/config/labels';
import { startAudioCapture, type AudioCapture } from './audioCapture';
import { UtteranceDetector } from './utteranceDetector';
import { findTextTarget, insertTextAt } from './insertText';
import { googleEngine } from './engines/googleEngine';
import { SpeechError, type SpeechEngine } from './types';

// Swap this line to change the speech-to-text backend (see SpeechEngine).
const engine: SpeechEngine = googleEngine;

const IDLE_TIMEOUT_MS = 20_000;   // stop listening after this long without speech — never leave the mic hot
const SESSION_MAX_MS = 2 * 60_000;
const ERROR_VISIBLE_MS = 4000;

let capture: AudioCapture | null = null;
let detector: UtteranceDetector | null = null;
let target: HTMLElement | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;
let startedAt = 0;
let inFlight = 0;
// Bumped on every start and cancel so results from an abandoned session are dropped.
let sessionId = 0;
// Utterances are transcribed one at a time so text lands in the order it was spoken.
let queue: Promise<void> = Promise.resolve();

const setVoice = useVoiceStore.setState;

function language(): string {
  const chosen = useSettingsStore.getState().speechLanguage;
  return chosen === 'system' ? navigator.language || 'en-US' : chosen;
}

function isActive(): boolean {
  const { status } = useVoiceStore.getState();
  return status === 'starting' || status === 'listening' || status === 'finishing';
}

function showMessage(message: string): void {
  if (errorTimer) clearTimeout(errorTimer);
  setVoice({ status: 'error', message, transcribing: false, levels: SILENT_LEVELS });
  errorTimer = setTimeout(() => {
    if (useVoiceStore.getState().status === 'error') setVoice({ status: 'idle', message: null });
  }, ERROR_VISIBLE_MS);
}

function errorMessage(err: unknown): string {
  const code = err instanceof SpeechError ? err.code : 'failed';
  return LABELS.voice.errors[code] ?? LABELS.voice.errors.failed;
}

// Plain Enter finishes dictation, same as the hotkey. Capture phase + stopImmediatePropagation so
// it doesn't also submit the form or insert a newline in the field being dictated into.
function onEnter(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return;
  if (useVoiceStore.getState().status !== 'listening') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void stopDictation();
}

function onHidden(): void {
  if (document.hidden && isActive()) void stopDictation();
}

function releaseSession(): void {
  capture?.stop();
  capture = null;
  detector = null;
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
  document.removeEventListener('keydown', onEnter, true);
  document.removeEventListener('visibilitychange', onHidden);
}

function handleUtterance(pcm: Int16Array): void {
  const id = sessionId;
  const dest = target;
  inFlight++;
  setVoice({ transcribing: true });
  queue = queue.then(async () => {
    try {
      if (id !== sessionId) return;
      const text = await engine.transcribe(pcm, { language: language() });
      if (id !== sessionId || !text || !dest) return;
      insertTextAt(dest, text);
    } catch (err) {
      if (id !== sessionId) return;
      cancelDictation();
      showMessage(errorMessage(err));
    } finally {
      inFlight--;
      if (inFlight === 0 && id === sessionId) setVoice({ transcribing: false });
    }
  });
}

export async function startDictation(): Promise<void> {
  if (isActive()) return;
  if (errorTimer) clearTimeout(errorTimer);

  target = findTextTarget();
  if (!target) {
    showMessage(LABELS.voice.noTarget);
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    showMessage(LABELS.voice.errors['signed-out']);
    return;
  }

  const id = ++sessionId;
  setVoice({ status: 'starting', message: null, levels: SILENT_LEVELS, transcribing: false });
  try {
    const opened = await startAudioCapture((frame) => detector?.push(frame));
    if (id !== sessionId) {
      opened.stop();
      return;
    }
    capture = opened;
  } catch (err) {
    showMessage(errorMessage(err));
    return;
  }

  detector = new UtteranceDetector(handleUtterance, (level) =>
    setVoice((s) => ({ levels: [...s.levels.slice(1), level] })));
  startedAt = Date.now();
  document.addEventListener('keydown', onEnter, true);
  document.addEventListener('visibilitychange', onHidden);
  watchdog = setInterval(() => {
    const now = Date.now();
    if (!detector) return;
    if (now - detector.lastVoiceAt > IDLE_TIMEOUT_MS || now - startedAt > SESSION_MAX_MS) void stopDictation();
  }, 1000);
  detector.lastVoiceAt = startedAt;
  setVoice({ status: 'listening' });
}

// Finishes the session: whatever was said is still transcribed and inserted.
export async function stopDictation(): Promise<void> {
  const { status } = useVoiceStore.getState();
  if (status === 'starting') {
    cancelDictation();
    return;
  }
  if (status !== 'listening') return;
  const id = sessionId;
  detector?.flush();
  releaseSession();
  setVoice({ status: 'finishing', levels: SILENT_LEVELS });
  await queue;
  if (id === sessionId) setVoice({ status: 'idle', transcribing: false });
}

// Abandons the session: anything not yet inserted is discarded.
export function cancelDictation(): void {
  sessionId++;
  releaseSession();
  target = null;
  setVoice({ status: 'idle', transcribing: false, levels: SILENT_LEVELS, message: null });
}

export function toggleDictation(): void {
  const { status } = useVoiceStore.getState();
  if (status === 'listening') void stopDictation();
  else if (status === 'idle' || status === 'error') void startDictation();
}

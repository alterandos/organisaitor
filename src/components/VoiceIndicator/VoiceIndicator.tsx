import { createPortal } from 'react-dom';
import { useVoiceStore } from '@/store/voiceStore';
import { getEffectiveBinding } from '@/store/hotkeyOverridesStore';
import { cancelDictation, stopDictation } from '@/services/speech/dictation';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import styles from './VoiceIndicator.module.css';

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

// Shown whenever the microphone is open (or a dictation notice/error needs showing). Deliberately
// never takes focus — the buttons swallow mousedown — so the text field being dictated into keeps
// its caret and selection.
export function VoiceIndicator() {
  const status       = useVoiceStore((s) => s.status);
  const transcribing = useVoiceStore((s) => s.transcribing);
  const levels       = useVoiceStore((s) => s.levels);
  const message      = useVoiceStore((s) => s.message);

  // Registers on the shared Escape stack only while dictating: the indicator opens *after* any
  // modal being dictated into, so Escape cancels dictation and leaves that modal open.
  useEscapeClose(cancelDictation, status === 'starting' || status === 'listening' || status === 'finishing');

  if (status === 'idle') return null;

  const isError = status === 'error';
  const listening = status === 'listening';
  const busy = status === 'finishing' || (listening && transcribing);
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const label = isError
    ? message
    : status === 'starting'
      ? LABELS.voice.listening
      : status === 'finishing'
        ? LABELS.voice.transcribing
        : LABELS.voice.listening;

  return createPortal(
    <div
      className={`${styles.pill} ${isError ? styles.pillError : ''}`}
      role="status"
      aria-live="polite"
    >
      {!isError && (
        <span className={`${styles.mic} ${listening ? styles.micLive : ''}`}>
          <MicIcon />
        </span>
      )}

      {!isError && (
        <span className={styles.bars} aria-hidden="true">
          {levels.map((level, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{ height: `${4 + Math.round(level * 18)}px` }}
            />
          ))}
        </span>
      )}

      <span className={styles.text}>
        <span className={styles.label}>
          {label}
          {busy && !isError && status !== 'finishing' && <span className={styles.busy}> {LABELS.voice.transcribing}</span>}
        </span>
        {listening && (
          <span className={styles.hint}>
            {LABELS.voice.stopHint(getEffectiveBinding('action-dictate').primary ?? 'Ctrl+D')}
          </span>
        )}
      </span>

      {listening && (
        <>
          <button className={`${styles.btn} ${styles.btnDone}`} onMouseDown={keepFocus} onClick={() => void stopDictation()} aria-label={LABELS.voice.done} title={LABELS.voice.done}>✓</button>
          <button className={styles.btn} onMouseDown={keepFocus} onClick={cancelDictation} aria-label={LABELS.voice.cancel} title={LABELS.voice.cancel}>✕</button>
        </>
      )}
    </div>,
    document.body,
  );
}

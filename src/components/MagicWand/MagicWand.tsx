import { useState } from 'react';
import { LABELS } from '@/config/labels';
import styles from './MagicWand.module.css';

// The magic wand: "say it in words and the form fills itself in". One look and one behaviour for
// every form that has one (the calendar item modal, the date calculator, …). The component only
// collects the text; what it means is the host's reader, a pure function of the text (built-in
// rules today: utils/textToTask.ts, utils/dateCalc.ts; an AI reader later, which is why `onRead`
// may be async). `onRead` fills the form and says whether it found anything.
// Pasting into an empty box reads at once; Enter reads; Shift+Enter is a new line; Escape closes.

export function MagicWandButton({ open, onToggle, label = LABELS.magicWand.label }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" className={`${styles.button} ${open ? styles.buttonOpen : ''}`} onClick={onToggle}
      aria-label={label} aria-expanded={open} title={label}>
      🪄
    </button>
  );
}

export function MagicWandPanel({ hint, onRead, onClose, label = LABELS.magicWand.label, applyLabel = LABELS.magicWand.apply, nothingLabel = LABELS.magicWand.nothing }: {
  hint: string;
  label?: string;
  onRead: (text: string) => boolean | Promise<boolean>;
  onClose: () => void;
  applyLabel?: string;
  nothingLabel?: string;
}) {
  const [text, setText] = useState('');
  const [missed, setMissed] = useState(false);
  const [busy, setBusy] = useState(false);

  // A built-in reader answers at once; an async one (AI, later) holds the panel busy meanwhile.
  function read(value: string) {
    if (!value.trim() || busy) return;
    const done = (found: boolean) => { if (found) onClose(); else setMissed(true); };
    const result = onRead(value);
    if (typeof result === 'boolean') { done(result); return; }
    setBusy(true);
    void result.then(done).finally(() => setBusy(false));
  }

  return (
    <div className={styles.panel}>
      <textarea
        className={styles.text}
        placeholder={hint}
        aria-label={label}
        value={text}
        rows={3}
        autoFocus
        onChange={(e) => { setText(e.target.value); setMissed(false); }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (!pasted.trim() || text.trim()) return;
          e.preventDefault();
          setText(pasted);
          read(pasted);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); read(text); }
        }}
      />
      <div className={styles.foot}>
        {missed && <span className={styles.missed} role="status">{nothingLabel}</span>}
        <button type="button" className={styles.apply} disabled={!text.trim() || busy} onClick={() => read(text)}>{applyLabel}</button>
      </div>
    </div>
  );
}

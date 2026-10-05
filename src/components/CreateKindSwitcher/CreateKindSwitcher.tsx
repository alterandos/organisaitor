import { siblingCreateKinds, switchCreateKind } from '@/config/createKinds';
import { LABELS } from '@/config/labels';
import styles from './CreateKindSwitcher.module.css';

// The strip at the top of a creation pane: every kind of thing this section can create, the open
// one highlighted. Choosing another reopens as that kind, keeping what was typed (`draft`).
// Renders nothing when the section has only one kind. Kinds live in config/createKinds.ts.
export function CreateKindSwitcher({ current, draft }: { current: string; draft: string }) {
  const kinds = siblingCreateKinds(current);
  if (kinds.length < 2) return null;
  return (
    <div className={styles.switcher} role="tablist" aria-label={LABELS.createKinds.switcherAria}>
      {kinds.map((k) => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={k.id === current}
          className={`${styles.kind} ${k.id === current ? styles.kindActive : ''}`}
          onClick={() => { if (k.id !== current) switchCreateKind(k, draft); }}
        >
          <span className={styles.icon}>{k.icon}</span>
          {k.label}
        </button>
      ))}
    </div>
  );
}

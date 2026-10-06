import { useEffect, useReducer } from 'react';
import { LABELS } from '@/config/labels';
import { ARTIFACT_TYPES } from './artifactTypes';
import { WhenLine } from './WhenLine';
import { PaneStateKey } from './paneState';
import styles from './ObjectBody.module.css';

// The expanded pane under its top bar, rendered by artifactGroups.ts into a widget with its own
// React root (so typing in it never rebuilds the widget): the second heading line (WhenLine, then
// the kind's own active things) and the kind's Body. Re-reads the stores itself.
export function ArtifactBody({ targetType, targetId, stateKey, onToggle }: { targetType: string; targetId: string; stateKey: string; onToggle: () => void }) {
  const def = ARTIFACT_TYPES[targetType as keyof typeof ARTIFACT_TYPES];
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => def?.subscribe(refresh), [def]);
  const summary = def?.summarize(targetId) ?? null;
  if (!def || !summary) return null;
  const heading = <WhenLine def={def} id={targetId} targetType={targetType} summary={summary} />;
  const Body = def.Body;
  if (Body) return <PaneStateKey.Provider value={stateKey}><Body id={targetId} heading={heading} onToggle={onToggle} /></PaneStateKey.Provider>;
  return (
    <div className={styles.body}>
      <div className={styles.subheading} onClick={(e) => { if (e.target === e.currentTarget) onToggle(); }}>{heading}</div>
      <div className={styles.bottom}><span className={styles.ghostText}>{LABELS.noteObjects.body.noBody}</span></div>
    </div>
  );
}

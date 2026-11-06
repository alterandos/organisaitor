import { useTaskStore } from '@/store/taskStore';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CollectionId, EndeavourPeriod } from '@/types';
import { PeriodEditor } from './PeriodEditor';
import styles from './PeriodField.module.css';

// An Endeavour's dates in its editor (docs/features/endeavours.md phase 7), drawn by the one
// PeriodEditor. Changes apply at once. Without its own it shows the one it takes from above (a
// subject its semester's) and offers to set its own; with its own, to go back to the one above.

const L = LABELS.period;
const day = (iso: string | null) => (iso ? formatDate(iso + 'T00:00:00') : '…');

// `exams`: also its exam period (a semester's), shown whenever one is set.
export function PeriodField({ id, exams }: { id: CollectionId; exams?: boolean }) {
  const collections = useTaskStore((s) => s.collections);
  const update = useTaskStore((s) => s.updateCollection);
  const own = collections[id]?.period;
  const eff = effectivePeriod(id, collections);
  const set = (period: EndeavourPeriod | null) => update(id, { period });

  if (!own) {
    return (
      <div className={styles.field}>
        <span className={styles.label}>{L.title}</span>
        {eff ? (
          <p className={styles.hint}>
            {L.inherited(collections[eff.from as CollectionId]?.name ?? '', `${day(eff.period.start)} – ${day(eff.period.end)}`, eff.period.breaks.length)}
          </p>
        ) : <p className={styles.hint}>{L.none}</p>}
        <button type="button" className={styles.linkBtn} onClick={() => set(eff ? structuredClone(eff.period) : { start: null, end: null, breaks: [] })}>
          {L.setOwn}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{L.title}</span>
      <PeriodEditor period={own} exams={exams} onChange={set} />
      {eff && collections[id] && <InheritButton id={id} onClick={() => set(null)} />}
    </div>
  );
}

// "Take <the semester>'s again": shown only when something above has a period to take.
function InheritButton({ id, onClick }: { id: CollectionId; onClick: () => void }) {
  const collections = useTaskStore((s) => s.collections);
  const self = collections[id];
  const above = self ? effectivePeriod(id, { ...collections, [id]: { ...self, period: null } }) : null;
  if (!above) return null;
  return <button type="button" className={styles.linkBtn} onClick={onClick}>{L.takeInherited(collections[above.from as CollectionId]?.name ?? '')}</button>;
}

import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { DateInput } from '@/components/DateInput/DateInput';
import { TrashIcon } from '@/components/Icons';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CollectionId, EndeavourPeriod } from '@/types';
import styles from './PeriodField.module.css';

// An Endeavour's period and breaks, in its editor (docs/features/endeavours.md phase 7). Changes
// apply at once. Without its own it shows the one it takes from above (a subject its semester's)
// and offers to set its own; with its own, to go back to taking the one above.

const L = LABELS.period;
const day = (iso: string | null) => (iso ? formatDate(iso + 'T00:00:00') : '…');

export function PeriodField({ id }: { id: CollectionId }) {
  const collections = useTaskStore((s) => s.collections);
  const update = useTaskStore((s) => s.updateCollection);
  const own = collections[id]?.period;
  const eff = effectivePeriod(id, collections);
  const set = (period: EndeavourPeriod | undefined) => update(id, { period });

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

  const patch = (p: Partial<EndeavourPeriod>) => set({ ...own, ...p });
  return (
    <div className={styles.field}>
      <span className={styles.label}>{L.title}</span>
      <div className={styles.row}>
        <label className={styles.cell}><span className={styles.cellLabel}>{L.start}</span>
          <DateInput value={own.start ?? ''} onChange={(v) => patch({ start: v || null })} aria-label={L.start} />
        </label>
        <label className={styles.cell}><span className={styles.cellLabel}>{L.end}</span>
          <DateInput value={own.end ?? ''} min={own.start ?? undefined} onChange={(v) => patch({ end: v || null })} aria-label={L.end} />
        </label>
      </div>
      <span className={styles.cellLabel}>{L.breaks}</span>
      {own.breaks.map((b) => (
        <div key={b.id} className={styles.row} role="group" aria-label={b.label || L.breakLabel}>
          <input className={styles.input} aria-label={L.breakLabel} placeholder={L.breakPlaceholder} value={b.label}
            onChange={(e) => patch({ breaks: own.breaks.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)) })} />
          <DateInput value={b.from} onChange={(v) => v && patch({ breaks: own.breaks.map((x) => (x.id === b.id ? { ...x, from: v, to: x.to < v ? v : x.to } : x)) })} aria-label={L.from} />
          <DateInput value={b.to} min={b.from} onChange={(v) => v && patch({ breaks: own.breaks.map((x) => (x.id === b.id ? { ...x, to: v } : x)) })} aria-label={L.to} />
          <button type="button" className={styles.iconBtn} aria-label={L.removeBreak} title={L.removeBreak} onClick={() => patch({ breaks: own.breaks.filter((x) => x.id !== b.id) })}>
            <TrashIcon width="1em" height="1em" />
          </button>
        </div>
      ))}
      <div className={styles.actions}>
        <button type="button" className={styles.linkBtn} onClick={() => {
          const from = own.start ?? new Date().toISOString().slice(0, 10);
          patch({ breaks: [...own.breaks, { id: nanoid(8), label: '', from, to: from }] });
        }}>{L.addBreak}</button>
        {eff && collections[id] && <InheritButton id={id} onClick={() => set(undefined)} />}
      </div>
    </div>
  );
}

// "Take <the semester>'s again": shown only when something above has a period to take.
function InheritButton({ id, onClick }: { id: CollectionId; onClick: () => void }) {
  const collections = useTaskStore((s) => s.collections);
  const self = collections[id];
  const above = self ? effectivePeriod(id, { ...collections, [id]: { ...self, period: undefined } }) : null;
  if (!above) return null;
  return <button type="button" className={styles.linkBtn} onClick={onClick}>{L.takeInherited(collections[above.from as CollectionId]?.name ?? '')}</button>;
}

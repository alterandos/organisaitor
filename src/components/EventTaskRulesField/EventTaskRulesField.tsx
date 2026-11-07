import { nanoid } from 'nanoid';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { EventTaskRule } from '@/types';
import styles from './EventTaskRulesField.module.css';

// The lines of an event's task rules (the user, 2026-11-04: "prepare for the lecture", "review it"):
// one per task, its title and how many days: a preparation's before (when to start; it's due when
// the event starts), a follow-up's after (when it's due). Whether a line is one or the other is set
// when it's added, never chosen on the line (2026-11-07: "prepare … after" made no sense). The watcher
// (services/eventTaskRules.ts) makes the tasks. Shown in an event's Tasks under All dates
// (TaskLinks/EventTasksField, 2026-11-05: one Tasks section, no separate "Tasks for each one") and in
// a template's classes (components/TemplateEditor).

const L = LABELS.eventTaskRules;

export function TaskRulesEditor({ rules, onChange, presets = true }: { rules: EventTaskRule[]; onChange: (next: EventTaskRule[]) => void; presets?: boolean }) {
  const change = (id: string, patch: Partial<EventTaskRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const unused = presets ? L.presets.filter((p) => !rules.some((r) => r.title === p.title)) : [];
  return (
    <>
      {rules.map((r) => (
        <div key={r.id} className={styles.line} role="group" aria-label={r.title || L.taskTitle}>
          <input className={styles.title} aria-label={L.taskTitle} placeholder={L.taskPlaceholder} value={r.title} autoFocus={!r.title}
            onChange={(e) => change(r.id, { title: e.target.value })} />
          <span className={styles.unit}>{r.side === 'before' ? L.startLead : L.dueLead}</span>
          <input className={styles.days} type="number" min={0} max={30} aria-label={L.days} value={r.days}
            onChange={(e) => change(r.id, { days: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) })} />
          <span className={styles.unit}>{r.side === 'before' ? L.before(r.days) : L.after(r.days)}</span>
          <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${r.title}`} title={L.remove} onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
            <TrashIcon width="1em" height="1em" />
          </button>
        </div>
      ))}
      {/* Where the host has its own Prepare / Follow up buttons (an event's Tasks), none here. */}
      {presets && <div className={styles.adds}>
        {unused.map((p) => (
          <button key={p.title} type="button" className={styles.chip} onClick={() => onChange([...rules, { id: nanoid(8), title: p.title, side: p.side, days: p.days }])}>
            + {p.title} · {p.side === 'before' ? L.startLead : L.dueLead} {p.days > 0 ? `${p.days} ` : ''}{p.side === 'before' ? L.before(p.days) : L.after(p.days)}
          </button>
        ))}
        <button type="button" className={styles.linkBtn} onClick={() => onChange([...rules, { id: nanoid(8), title: '', side: 'before', days: 1 }])}>{L.addPrep}</button>
        <button type="button" className={styles.linkBtn} onClick={() => onChange([...rules, { id: nanoid(8), title: '', side: 'after', days: 0 }])}>{L.addFollow}</button>
      </div>}
    </>
  );
}

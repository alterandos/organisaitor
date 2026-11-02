import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { STREAM_KINDS } from '@/config/streamKinds';
import { LABELS } from '@/config/labels';
import { addDaysToIso, formatDate } from '@/utils/date';
import { todayIsoInZone, resolveTimezone } from '@/utils/timezone';
import { inEndeavourScope } from '@/utils/endeavourGraph';
import { BEHIND_DAYS, TASKS_ALWAYS_DAYS, TASKS_NEAR_DAYS, isRhythm, rhythmOccurrences, showsInTasks, tickIndex } from '@/utils/rhythms';
import { itemOccurrences, repeatingItemsOf } from '@/utils/itemOccurrences';
import { isSubject } from '@/utils/subjectItems';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { toggleDone } from '@/services/rhythms';
import { openOccurrence, toggleOccurrence } from '@/services/itemOccurrences';
import styles from './RhythmDueList.module.css';

// Rhythm occurrences in Tasks, for streams set to show there (docs/features/endeavours.md
// "Visibility"): behind, today and close ones, above the tasks, ticked like a task. The same
// Endeavour filter as the tasks below. Since phase 7 (e) a subject's repeating Work shows the same
// way (behind, or due within TASKS_NEAR_DAYS), as do-by streams did.

const L = LABELS.rhythms;

export function RhythmDueList({ scope }: { scope: ReadonlySet<string> | null }) {
  const collections = useTaskStore((s) => s.collections);
  const entries = useTrackerStore((s) => s.entries);
  const schedules = useScheduleStore((s) => s.schedules);
  const events = useCalendarStore((s) => s.events);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const timezone = useSettingsStore((s) => s.timezone);
  const today = todayIsoInZone(resolveTimezone(timezone));

  const due = useMemo(() => {
    const ticks = tickIndex(entries, collections);
    const from = addDaysToIso(today, -BEHIND_DAYS);
    const to = addDaysToIso(today, TASKS_ALWAYS_DAYS);
    return Object.values(collections)
      .filter((c) => isRhythm(c) && !c.archivedAt && inEndeavourScope(scope, c.id))
      .flatMap((c) => rhythmOccurrences(c, schedules, ticks, from, to, today, events))
      .filter((o) => showsInTasks(o, today));
  }, [collections, entries, schedules, today, scope, events]);

  const work = useMemo(() => Object.values(collections)
    .filter((c) => isSubject(c) && !c.archivedAt && inEndeavourScope(scope, c.id))
    .flatMap((c) => itemOccurrences(repeatingItemsOf(c.id, events, deadlines).filter((i) => i.kind === 'work'), { events, deadlines },
      addDaysToIso(today, -BEHIND_DAYS), addDaysToIso(today, TASKS_NEAR_DAYS), today))
    .filter((o) => o.state === 'behind' || o.state === 'today' || o.state === 'upcoming'),
  [collections, events, deadlines, today, scope]);

  if (due.length === 0 && work.length === 0) return null;
  return (
    <>
    {work.length > 0 && (
      <section className={styles.due} aria-label={LABELS.itemBoard.dueTitle}>
        <h3 className={styles.title}>{LABELS.itemBoard.dueTitle}</h3>
        {work.map((o) => (
          <div key={o.key} className={styles.row}>
            <input type="checkbox" className={styles.tick} checked={false} onChange={() => toggleOccurrence(o)} aria-label={`${LABELS.itemBoard.markDone}: ${o.series.title}`} />
            <span aria-hidden>{ITEM_TYPE_ICON.deadline}</span>
            <button type="button" className={styles.name} onClick={() => openOccurrence(o)}>{(o.copy ?? o.series).title}</button>
            <span className={styles.from}>{(o.series.collectionId ? collections[o.series.collectionId]?.name : null)}</span>
            <span className={`${styles.when} ${o.state === 'behind' ? styles.late : ''}`}>{o.state === 'today' ? L.states.today : formatDate(o.date + 'T00:00:00')}</span>
          </div>
        ))}
      </section>
    )}
    {due.length > 0 && (
    <section className={styles.due} aria-label={L.dueTitle}>
      <h3 className={styles.title}>{L.dueTitle}</h3>
      {due.map((o) => (
        <div key={o.key} className={styles.row}>
          <input
            type="checkbox"
            className={styles.tick}
            checked={false}
            onChange={() => toggleDone(o.rhythm.id, o.stream.id, o.date)}
            aria-label={`${L.markDone}: ${o.stream.label}`}
          />
          <span aria-hidden>{STREAM_KINDS[o.stream.kind].icon}</span>
          <button
            type="button"
            className={styles.name}
            onClick={() => { const ui = useUIStore.getState(); ui.setActiveView('records'); ui.setActiveRoutine(o.rhythm.id); }}
          >
            {o.stream.label}
          </button>
          <span className={styles.from}>{o.rhythm.name}</span>
          <span className={`${styles.when} ${o.state === 'behind' ? styles.late : ''}`}>
            {o.state === 'today' ? L.states.today : formatDate(o.date + 'T00:00:00')}
          </span>
        </div>
      ))}
    </section>
    )}
    </>
  );
}

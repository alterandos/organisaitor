import { useMemo, useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { AttributesSummary } from '@/components/EndeavourAttributes/EndeavourAttributesPane';
import { EndeavourContentsSummary } from '@/components/EndeavourContents/EndeavourContentsModal';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import { CloseIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { addOutline, outlineDraftsFor } from '@/services/subjectItems';
import { repeatSummary } from '@/services/recurringTasks';
import { readCourseOutline, type CourseOutline } from '@/utils/courseOutline';
import { worthOf, classTitles, draftFromDeadline, draftFromEvent, scheduleListOf, workListOf, type SubjectItemDraft, type SubjectItemKind } from '@/utils/subjectItems';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { parentsOf } from '@/utils/endeavourGraph';
import { formatDate, todayIso } from '@/utils/date';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import type { CalendarDeadline, CalendarEvent, CollectionId } from '@/types';
import { SubjectItemEditor } from './SubjectItemEditor';
import styles from './TemplateEditors.module.css';

// A subject's own editor (docs/features/endeavours.md phase 7 (d)): opened by Edit on an Endeavour
// made from the Subject template (config/templateEditors.ts). Its name and period, then two lists
// of its real items, Schedule (what you go to) and Work (what you do or hand in), so a change made
// in the calendar shows here too. Each item is one line; clicking it opens its small editor. The
// magic wand reads a course outline into both lists, shown before anything is added. Everything
// applies as it's changed; "All settings" opens the ordinary Endeavour editor.

const L = LABELS.subjectEditor;
const R = LABELS.recurring;
const day = (iso: string) => formatDate(iso + 'T00:00:00');
const timeRange = (a: string | null, b: string | null) => (a ? (b ? `${a}–${b}` : a) : '');

// One line's "when": "Wed 12:15–14:00 · every 2 weeks", "1 day before each GEOS215 lecture".
function itemWhen(d: SubjectItemDraft): string {
  const r = d.repeat;
  const parts: string[] = [];
  if (d.follow) parts.push(R.follows(d.follow.offsetDays, d.follow.title));
  else if (r?.freq === 'weekly') {
    const days = (r.daysOfWeek?.length ? r.daysOfWeek : [new Date(d.date + 'T00:00:00').getDay()]).map((n) => R.dayName[n].slice(0, 3)).join(', ');
    parts.push([days, timeRange(d.start, d.end)].filter(Boolean).join(' '));
    if (r.interval > 1) parts.push(L.everyWeeks(r.interval));
  } else if (r) parts.push(repeatSummary(r), timeRange(d.start, d.end));
  else parts.push([day(d.date), timeRange(d.start, d.end)].filter(Boolean).join(' '));
  if (d.place) parts.push(d.place);
  const worth = worthOf(d);
  if (worth !== null) parts.push(L.worth(worth));
  return parts.filter(Boolean).join(' · ');
}

type Open = { kind: SubjectItemKind; id: string | null } | null;

export function SubjectEditor({ id }: { id: CollectionId }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const collections = useTaskStore((s) => s.collections);
  const events = useCalendarStore((s) => s.events);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const c = collections[id];
  const [name, setName] = useState(() => c?.name ?? '');
  const [open, setOpen] = useState<Open>(null);
  const [wand, setWand] = useState(false);
  const [found, setFound] = useState<{ outline: CourseOutline; drafts: SubjectItemDraft[] } | null>(null);
  const [typeTasks, setTypeTasks] = useState(true);
  const itemForm = useRef<HTMLFormElement>(null);
  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => (itemForm.current ? itemForm.current.requestSubmit() : closeModal()));

  const schedule = useMemo(() => scheduleListOf(id, events), [id, events]);
  const work = useMemo(() => workListOf(id, deadlines), [id, deadlines]);
  if (!c) return null;

  const classes = classTitles(schedule);
  const start = effectivePeriod(id, collections)?.period.start;
  const defaultDate = start && start > todayIso() ? start : todayIso();
  const semester = parentsOf(c, collections).map((p) => collections[p]).find((p) => p?.templateId === 'semester' && !p.archivedAt);
  const ui = useUIStore.getState;

  function saveName() {
    const next = name.trim();
    if (next && next !== c!.name) useTaskStore.getState().updateCollection(id, { name: next });
    else setName(c!.name);
  }

  function readOutline(text: string): boolean {
    const outline = readCourseOutline(text, start ?? null);
    const drafts = outlineDraftsFor(id, outline);
    if (!drafts.length) return false;
    setFound({ outline, drafts });
    setWand(false);
    return true;
  }

  function addFound() {
    if (!found) return;
    const { made, undo } = addOutline(id, found.outline, { typeTasks });
    setFound(null);
    showToast({ message: L.added(made), actions: [{ label: L.undo, onClick: undo }] });
  }

  const list = (kind: SubjectItemKind, items: (CalendarEvent | CalendarDeadline)[]) => (
    <section className={styles.section} aria-label={kind === 'schedule' ? L.schedule : L.work}>
      <div className={styles.sectionHead}>
        <h3 className={styles.label}>{kind === 'schedule' ? L.schedule : L.work}</h3>
        <span className={styles.hint}>{kind === 'schedule' ? L.scheduleHint : L.workHint}</span>
      </div>
      {items.length === 0 && !(open?.kind === kind && !open.id) && <p className={styles.empty}>{L.empty}</p>}
      <ul className={styles.items}>
        {items.map((x) => {
          const isOpen = open?.kind === kind && open.id === x.id;
          const draft = kind === 'schedule' ? draftFromEvent(x as CalendarEvent) : draftFromDeadline(x as CalendarDeadline, events);
          return (
            <li key={x.id}>
              <button type="button" className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`} aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : { kind, id: x.id })}>
                <span className={styles.itemIcon} aria-hidden>{kind === 'work' ? ITEM_TYPE_ICON.deadline : x.repeat ? '🗓' : ITEM_TYPE_ICON.event}</span>
                <span className={styles.itemTitle}>{x.title}</span>
                <span className={styles.itemWhen}>{itemWhen(draft)}</span>
              </button>
              {isOpen && (
                <SubjectItemEditor key={x.id} subjectId={id} kind={kind} item={x} classes={classes} defaultDate={defaultDate} formRef={itemForm} onDone={() => setOpen(null)} />
              )}
            </li>
          );
        })}
      </ul>
      {open?.kind === kind && !open.id
        ? <SubjectItemEditor key={`new-${kind}`} subjectId={id} kind={kind} item={null} classes={classes} defaultDate={defaultDate} formRef={itemForm} onDone={() => setOpen(null)} />
        : <button type="button" className={styles.addBtn} onClick={() => setOpen({ kind, id: null })}>{L.add}</button>}
    </section>
  );

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="subject-editor-title">
        <div className={styles.header}>
          {semester && <button type="button" className={styles.linkBtn} onClick={() => ui().openEditCollection(semester)}>{L.back(semester.name)}</button>}
          <h2 id="subject-editor-title" className={styles.title}>🎓 {c.name}</h2>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.label}>{L.name}</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>

          <AttributesSummary id={id} />

          <EndeavourContentsSummary id={id} />

          <div className={styles.wandRow}>
            <MagicWandButton open={wand} onToggle={() => setWand((w) => !w)} />
            <span className={styles.hint}>{L.wandHint}</span>
          </div>
          {wand && <MagicWandPanel hint={L.wandHint} onRead={readOutline} onClose={() => setWand(false)} />}
          {found && (
            <section className={styles.found} aria-label={L.found(found.drafts.length)}>
              <p className={styles.hint}>{L.found(found.drafts.length)}</p>
              <ul className={styles.foundList}>
                {found.drafts.map((d, i) => (
                  <li key={i}>{d.kind === 'work' ? ITEM_TYPE_ICON.deadline : d.repeat ? '🗓' : ITEM_TYPE_ICON.event} {d.title} · {itemWhen(d)}</li>
                ))}
              </ul>
              {/* A Type's tasks (an Exam's Revise and Check the result) are made with it only if wanted (the user, 2026-10-30) */}
              <label className={styles.taskRow}>
                <input type="checkbox" checked={typeTasks} onChange={(e) => setTypeTasks(e.target.checked)} />
                <span className={styles.hint}>{L.typeTasks}</span>
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.submitBtn} onClick={addFound}>{L.addFound}</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => setFound(null)}>{L.notNow}</button>
              </div>
            </section>
          )}

          {list('schedule', schedule)}
          {list('work', work)}
        </div>

        <div className={`${styles.actions} ${styles.footer}`}>
          <button type="button" className={styles.secondaryBtn} onClick={() => ui().openEndeavourSettings(c)}>{L.allSettings}</button>
          <span className={styles.spacer} />
          <button type="button" className={styles.submitBtn} onClick={closeModal}>{L.done}</button>
        </div>
      </div>
    </div>
  );
}

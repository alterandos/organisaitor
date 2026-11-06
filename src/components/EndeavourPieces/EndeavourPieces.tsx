import { TYPES_ENABLED } from '@/config/features';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useUIStore } from '@/store/uiStore';
import { TrashIcon } from '@/components/Icons';
import { FieldError } from '@/components/FieldError/FieldError';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { filedDetail, filedIcon, filedUnder, openFiled, removeFiled, type FiledItem, type FiledKind } from '@/services/endeavourFiling';
import { addPart, addToEndeavour, partsOf } from '@/services/endeavourTemplates';
import { templateFor } from '@/services/templates';
import { templateSuggestions, type PlanSuggestion } from '@/utils/templatePlan';
import { addOutline, outlineDraftsFor } from '@/services/subjectItems';
import { blankPlan } from '@/config/endeavourTemplates';
import { LABELS } from '@/config/labels';
import { readCourseOutline, type CourseOutline } from '@/utils/courseOutline';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { itemWhen } from './itemWhen';
import type { CollectionId } from '@/types';
import type { SubjectItemDraft } from '@/utils/subjectItems';
import styles from './EndeavourPieces.module.css';

// THE place for what's in an Endeavour (CLAUDE.md "What's in an Endeavour is one component",
// agreed with the user 2026-11-04): on its home, one tile per kind of thing that can be filed under
// it, each thing a small card saying what it is, which opens it where it's edited; "+ Add" opens the
// app's own creation pane (filed under it, since its home is the active Endeavour). A template adds
// its suggestions (never made silently), the Endeavours made from its parts' template (a semester's
// subjects), and a subject's course-outline reader.

const L = LABELS.endeavourPieces;
const DAY_NAMES = LABELS.templates.dayNames;
const SHOWN = 6;

interface AddChoice { label: string; hint?: string; run: (id: CollectionId) => void }
interface TileDef { key: string; title: string; hint: string; kinds: FiledKind[]; adds: AddChoice[] }

const ui = () => useUIStore.getState();
const K = L.kinds;
const TILES: TileDef[] = [
  { key: 'calendar', title: L.calendar, hint: L.calendarHint, kinds: ['event', 'timetable', 'deadline', 'reminder'], adds: [
    { label: K.event, hint: L.kindHints.event, run: () => ui().showAddCalendarItem(undefined, 'event') },
    { label: K.timetable, hint: L.kindHints.timetable, run: () => ui().showAddSchedule() },
    { label: K.deadline, hint: L.kindHints.deadline, run: () => ui().showAddCalendarItem(undefined, 'deadline') },
    { label: K.reminder, hint: L.kindHints.reminder, run: () => ui().showAddCalendarItem(undefined, 'reminder') },
  ] },
  { key: 'tasks', title: L.tasks, hint: L.tasksHint, kinds: ['task'], adds: [{ label: K.task, run: () => ui().showAddTask() }] },
  { key: 'notebooks', title: L.notebooks, hint: L.notebooksHint, kinds: ['notebook'], adds: [{ label: L.notebooks, run: () => ui().showAddNoteTag(null, 'area') }] },
  { key: 'lists', title: L.lists, hint: L.listsHint, kinds: ['list'], adds: [{ label: L.lists, run: () => ui().showAddList() }] },
  { key: 'records', title: L.records, hint: L.recordsHint, kinds: ['record'], adds: [
    { label: K.tracker, hint: L.kindHints.tracker, run: () => ui().showAddTracker() },
    { label: K.routine, hint: L.kindHints.routine, run: () => ui().showAddRoutine() },
  ] },
  { key: 'goals', title: L.goals, hint: L.goalsHint, kinds: ['goal'], adds: [{ label: L.goals, run: (id) => ui().showAddGoal(id) }] },
];

export function EndeavourPieces({ id }: { id: CollectionId }) {
  // What's filed under it, live: each store it reads is subscribed to.
  useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  useCalendarStore((s) => s.events);
  useCalendarStore((s) => s.deadlines);
  useCalendarStore((s) => s.reminders);
  useNoteStore((s) => s.noteTags);
  useNoteStore((s) => s.notes);
  useListStore((s) => s.lists);
  useListStore((s) => s.listItems);
  useScheduleStore((s) => s.schedules);
  useGoalStore((s) => s.goals);
  const dismissed = useUIStore((s) => s.dismissedSuggestions[id]);
  const c = collections[id];
  if (!c) return null;

  const filed = filedUnder(id);
  const template = templateFor(c.templateId);
  const partsTemplate = templateFor(template?.partsFrom);
  const filedTitles = new Set(filed.map((i) => i.title));
  const suggestions = template
    ? templateSuggestions(template, c.name, { list: L.suggestList, task: (w) => (w === null ? L.suggestTask : L.suggestWeekly(DAY_NAMES[w])), goal: L.suggestGoal })
      .filter((s) => !dismissed?.includes(s.id) && !filedTitles.has(s.title))
    : [];

  return (
    <section className={styles.pieces} aria-label={L.title}>
      <h3 className={styles.heading}>{L.title}</h3>

      {template?.readsOutline && <OutlineWand id={id} />}

      {suggestions.length > 0 && (
        <div className={styles.suggestions} role="group" aria-label={L.suggested}>
          <span className={styles.groupLabel}>{L.suggested}</span>
          {suggestions.map((s) => <SuggestionCard key={s.id} id={id} name={c.name} s={s} />)}
        </div>
      )}

      <div className={styles.tiles}>
        {template?.partsFrom && <PartsTile id={id} from={template.partsFrom} one={partsTemplate?.name ?? L.partOne} many={template.partsLabel || partsTemplate?.name || L.partOne} count={partsOf(id).length} />}
        {TILES.map((t) => <FiledTile key={t.key} tile={t} id={id} items={filed.filter((i) => t.kinds.includes(i.kind))} />)}
      </div>
    </section>
  );
}

function FiledTile({ tile, id, items }: { tile: TileDef; id: CollectionId; items: FiledItem[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <Tile title={tile.title} hint={tile.hint} count={items.length} adds={tile.adds} id={id}>
      {shown.map((i) => <MiniCard key={`${i.kind}:${i.id}`} item={i} noun={tile.title} />)}
      {items.length > SHOWN && !all && <button type="button" className={styles.linkBtn} onClick={() => setAll(true)}>{L.more(items.length - SHOWN)}</button>}
    </Tile>
  );
}

// One thing filed under it: what it is and when, opening it where it's edited.
function MiniCard({ item, noun }: { item: FiledItem; noun: string }) {
  async function remove() {
    // Something already made is never empty here, so it asks.
    if (await confirmDelete(noun.toLowerCase(), item.title, undefined, { empty: false })) removeFiled(item);
  }
  return (
    <div className={styles.card}>
      <button type="button" className={styles.cardMain} onClick={() => openFiled(item)}>
        <span className={styles.cardIcon} aria-hidden>{filedIcon(item.kind)}</span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>{item.title}</span>
          <span className={styles.cardDetail}>{filedDetail(item)}</span>
        </span>
      </button>
      <div className={styles.cardActions}>
        {item.kind === 'deadline' && (
          <button type="button" className={styles.cardLink} onClick={() => ui().showAddTaskForEvent({ kind: 'prepFor', targetType: 'deadline', targetId: item.id })}>{L.taskFor}</button>
        )}
        <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${item.title}`} title={L.remove} onClick={() => void remove()}>
          <TrashIcon width="1em" height="1em" />
        </button>
      </div>
    </div>
  );
}

function Tile({ title, hint, count, adds, id, children }: { title: string; hint: string; count: number; adds: AddChoice[]; id: CollectionId; children: ReactNode }) {
  const [choosing, setChoosing] = useState(false);
  function add() {
    if (adds.length === 1) adds[0].run(id); else setChoosing((o) => !o);
  }
  return (
    <section className={styles.tile} aria-label={title}>
      <div className={styles.tileHead}>
        <span className={styles.tileTitle}>{title}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
        <button type="button" className={styles.tileAdd} aria-label={L.addTo(title)} aria-expanded={adds.length > 1 ? choosing : undefined} onClick={add}>{L.add}</button>
      </div>
      {choosing && (
        <div className={styles.choices} role="group" aria-label={L.addTo(title)}>
          {adds.map((a) => (
            <button key={a.label} type="button" className={styles.choice} onClick={() => { setChoosing(false); a.run(id); }}>
              <span className={styles.choiceLabel}>{a.label}</span>
              {a.hint && <span className={styles.cardDetail}>{a.hint}</span>}
            </button>
          ))}
        </div>
      )}
      {count === 0 && !choosing && <p className={styles.hint}>{hint}</p>}
      <div className={styles.cards}>{children}</div>
    </section>
  );
}

// Another Endeavour made part of it from its parts' template (a semester's subject), by name: the
// subject's code split from its name. Those already made show above, with how each is going.
function PartsTile({ id, from, one, many, count }: { id: CollectionId; from: string; one: string; many: string; count: number }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  function add() {
    if (!name.trim()) { setError(true); return; }
    const { undo } = addPart(id, from, name);
    setName('');
    showToast({ message: `${one}: ${name.trim()}`, actions: [{ label: L.undo, onClick: undo }] });
  }

  return (
    <section className={`${styles.tile} ${styles.tileFirst}`} aria-label={many}>
      <div className={styles.tileHead}><span className={styles.tileTitle}>{L.parts(many)}</span>{count > 0 && <span className={styles.count}>{count}</span>}</div>
      <p className={styles.hint}>{L.partsHint(one)}</p>
      <div className={styles.addLine}>
        <input className={styles.input} aria-label={L.partName(one)} placeholder={L.partPlaceholder} value={name}
          aria-invalid={error || undefined} aria-describedby={error ? `parts-error-${id}` : undefined}
          onChange={(e) => { setName(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className={styles.tileAdd} onClick={add}>{L.add}</button>
      </div>
      <FieldError id={`parts-error-${id}`}>{error ? L.partNeeded(one) : null}</FieldError>
    </section>
  );
}

function SuggestionCard({ id, name, s }: { id: CollectionId; name: string; s: PlanSuggestion }) {
  function take() {
    const { undo } = addToEndeavour(id, { ...blankPlan(name), ...s.plan });
    showToast({ message: `${L.added1}: ${s.title}`, actions: [{ label: L.undo, onClick: undo }] });
  }
  return (
    <div className={styles.suggestion}>
      <span className={styles.cardText}>
        <span className={styles.cardTitle}>{s.label}</span>
        <span className={styles.cardDetail}>{s.detail}</span>
      </span>
      <button type="button" className={styles.tileAdd} onClick={take}>{L.addSuggestion}</button>
      <button type="button" className={styles.linkBtn} onClick={() => ui().dismissSuggestion(id, s.id)}>{L.notNeeded}</button>
    </div>
  );
}

// A subject's course outline, read into its calendar: what's found is listed first, then made.
function OutlineWand({ id }: { id: CollectionId }) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ outline: CourseOutline; drafts: SubjectItemDraft[] } | null>(null);
  const [typeTasks, setTypeTasks] = useState(true);

  function read(text: string): boolean {
    const outline = readCourseOutline(text, effectivePeriod(id, useTaskStore.getState().collections)?.period.start ?? null);
    const drafts = outlineDraftsFor(id, outline);
    if (!drafts.length) return false;
    setFound({ outline, drafts });
    setOpen(false);
    return true;
  }

  function addFound() {
    if (!found) return;
    const { made, undo } = addOutline(id, found.outline, { typeTasks });
    setFound(null);
    showToast({ message: L.added(made), actions: [{ label: L.undo, onClick: undo }] });
  }

  return (
    <div className={styles.wand}>
      <div className={styles.wandRow}>
        <MagicWandButton open={open} onToggle={() => setOpen((o) => !o)} label={L.wand} />
        <span className={styles.hint}>{L.wandHint}</span>
      </div>
      {open && <MagicWandPanel label={L.wand} hint={L.wandHint} onRead={read} onClose={() => setOpen(false)} />}
      {found && (
        <div className={styles.found} role="group" aria-label={L.found(found.drafts.length)}>
          <p className={styles.hint}>{L.found(found.drafts.length)}</p>
          <ul className={styles.foundList}>{found.drafts.map((d, i) => <li key={i}>{d.title} · {itemWhen(d)}</li>)}</ul>
          {TYPES_ENABLED && <label className={styles.check}><input type="checkbox" checked={typeTasks} onChange={(e) => setTypeTasks(e.target.checked)} /> {L.typeTasks}</label>}
          <div className={styles.addLine}>
            <button type="button" className={styles.submitBtn} onClick={addFound}>{L.addFound}</button>
            <button type="button" className={styles.secondaryBtn} onClick={() => setFound(null)}>{L.notNow}</button>
          </div>
        </div>
      )}
    </div>
  );
}

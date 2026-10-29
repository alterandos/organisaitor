import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { usePlatform } from '@/hooks/usePlatform';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { todayIso } from '@/utils/date';
import type { CalendarItemKind } from '@/types';
import { LABELS } from '@/config/labels';
import { addSticky } from '@/services/stickyNotes';
import styles from './AddTaskButton.module.css';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { pickableTypes } from '@/utils/itemTypes';
import { makeAsOf } from '@/services/itemTypes';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import type { CollectionId, ItemTypeId } from '@/types';
import type { ComponentType, SVGProps } from 'react';
import { CalendarIcon, EndeavourIcon, GoalIcon, ListIcon, NotebookIcon, PlusIcon, PresetIcon, PurposeIcon, ReminderIcon, RoutineIcon, StickyIcon, TagIcon, TrackerIcon, UploadIcon } from '@/components/Icons';

// Each option's icon: a line icon from components/Icons, drawn on its coloured circle.
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type TaskDialType      = 'tag' | 'collection' | 'purpose' | 'task';
type CalDialType       = 'event' | 'reminder';
type RecordsDialType   = 'tracker' | 'entry' | 'routine';
type PortfolioDialType = 'watchlist-item' | 'portfolio-tag' | 'investment-purpose' | 'bulk-upload';

const TASK_OPTIONS: { type: TaskDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'tag',        label: 'Tag',              color: 'var(--color-swatch-purple)', Icon: TagIcon },
  { type: 'collection', label: LABELS.collection,  color: 'var(--color-swatch-green)', Icon: EndeavourIcon },
  { type: 'purpose',    label: 'Purpose',          color: 'var(--color-swatch-orange)', Icon: PurposeIcon },
  { type: 'task',       label: 'Task',             color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

const CAL_OPTIONS: { type: CalDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'reminder', label: LABELS.calendarItemKind.reminder, color: 'var(--color-swatch-green)', Icon: ReminderIcon },
  { type: 'event',    label: LABELS.calendarItemKind.event,    color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

const REC_OPTIONS: { type: RecordsDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'routine', label: LABELS.routine,  color: 'var(--color-swatch-orange)', Icon: RoutineIcon },
  { type: 'tracker', label: LABELS.tracker,  color: 'var(--color-swatch-green)', Icon: TrackerIcon },
  { type: 'entry',   label: 'New entry',     color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

const PORTFOLIO_OPTIONS: { type: PortfolioDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'investment-purpose', label: LABELS.investmentPurpose, color: 'var(--color-swatch-purple)', Icon: PurposeIcon },
  { type: 'portfolio-tag',      label: LABELS.portfolioTag,      color: 'var(--color-swatch-green)', Icon: TagIcon },
  { type: 'bulk-upload',        label: 'Bulk Import',            color: 'var(--color-swatch-grey)', Icon: UploadIcon },
  { type: 'watchlist-item',     label: LABELS.watchlistItem,     color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

type ListsDialType = 'list' | 'list-item';
const LISTS_OPTIONS: { type: ListsDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'list',      label: 'New list',  color: 'var(--color-swatch-green)', Icon: ListIcon },
  { type: 'list-item', label: 'Add item',  color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

type NotesDialType = 'note' | 'notebook' | 'custom-tag' | 'tag-preset' | 'sticky';
const NOTES_OPTIONS: { type: NotesDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'notebook',   label: 'Notebook',   color: 'var(--color-swatch-purple)', Icon: NotebookIcon },
  { type: 'custom-tag', label: 'Custom tag', color: 'var(--color-swatch-green)', Icon: TagIcon },
  { type: 'tag-preset', label: 'Tag presets', color: 'var(--color-swatch-grey)', Icon: PresetIcon },
  { type: 'sticky',     label: LABELS.stickies.add, color: 'var(--color-swatch-yellow)', Icon: StickyIcon },
  { type: 'note',       label: 'Note',       color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

type FitnessDialType = 'activity';
const FITNESS_OPTIONS: { type: FitnessDialType; label: string; color: string; Icon: IconType }[] = [
  { type: 'activity', label: LABELS.activity, color: 'var(--color-swatch-indigo)', Icon: PlusIcon },
];

// The person's Types, above a section's own options (docs/features/endeavours.md screen D):
// choosing one opens the form for what it's usually made as, with the Type chosen. Capped, so the
// dial stays short; the rest are in the form's Type field.
const MAX_TYPES = 6;

function TypeOptions({ onPick }: { onPick: () => void }) {
  const types = useItemTypeStore((s) => s.types);
  const shown = pickableTypes(types).slice(0, MAX_TYPES);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((t) => (
        <div key={t.id} className={styles.optionRow}>
          <span className={styles.optionLabel}>{t.name}</span>
          <button
            className={`${styles.optionBtn} ${styles.typeBtn}`}
            onClick={() => { onPick(); useUIStore.getState().showAddTyped(t.id as ItemTypeId, makeAsOf(t.id)); }}
            aria-label={LABELS.itemTypes.newOf(t.name)}
          >
            <ItemIcon icon={t.icon} fallback="🏷️" className={styles.typeIcon} />
          </button>
        </div>
      ))}
      <div className={`${styles.optionRow} ${styles.typeDivider}`} aria-hidden />
    </>
  );
}

export function AddTaskButton() {
  const activeView           = useUIStore((s) => s.activeView);
  const activeTrackerId      = useUIStore((s) => s.activeTrackerId);
  const portfolioChartOpen   = useUIStore((s) => s.portfolioChartOpen);
  const showAddTask                = useUIStore((s) => s.showAddTask);
  const showAddCollection          = useUIStore((s) => s.showAddCollection);
  const showAddPurpose             = useUIStore((s) => s.showAddPurpose);
  const showAddTag                 = useUIStore((s) => s.showAddTag);
  const showAddCalendarItem        = useUIStore((s) => s.showAddCalendarItem);
  const showCalendarQuickAdd       = useUIStore((s) => s.showCalendarQuickAdd);
  const { isAndroid } = usePlatform();
  const showAddTracker             = useUIStore((s) => s.showAddTracker);
  const showAddEntry               = useUIStore((s) => s.showAddEntry);
  const showAddRoutine             = useUIStore((s) => s.showAddRoutine);
  const showAddWatchlistItem       = useUIStore((s) => s.showAddWatchlistItem);
  const showAddPortfolioTag        = useUIStore((s) => s.showAddPortfolioTag);
  const showAddInvestmentPurpose   = useUIStore((s) => s.showAddInvestmentPurpose);
  const showBulkUploadWatchlist    = useUIStore((s) => s.showBulkUploadWatchlist);
  const showAddList                = useUIStore((s) => s.showAddList);
  const showAddListItem            = useUIStore((s) => s.showAddListItem);
  const activeListId               = useUIStore((s) => s.activeListId);
  const showAddNote                = useUIStore((s) => s.showAddNote);
  const showAddNoteTag             = useUIStore((s) => s.showAddNoteTag);
  const showTagPresets             = useUIStore((s) => s.showTagPresets);
  const showAddActivity            = useUIStore((s) => s.showAddActivity);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEscapeClose(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handleTaskOption = (type: TaskDialType) => {
    setOpen(false);
    if (type === 'collection') showAddCollection();
    else if (type === 'purpose') showAddPurpose();
    else if (type === 'tag') showAddTag();
    else showAddTask();
  };

  const handleCalOption = (type: CalDialType) => {
    setOpen(false);
    if (isAndroid) showCalendarQuickAdd(todayIso(), null, type as CalendarItemKind);
    else showAddCalendarItem(undefined, type as CalendarItemKind);
  };

  const handleRecOption = (type: RecordsDialType) => {
    setOpen(false);
    if (type === 'routine') showAddRoutine();
    else if (type === 'tracker') showAddTracker();
    else if (activeTrackerId) showAddEntry(activeTrackerId);
    else showAddTracker();
  };

  const handlePortfolioOption = (type: PortfolioDialType) => {
    setOpen(false);
    if (type === 'watchlist-item')     showAddWatchlistItem();
    else if (type === 'portfolio-tag') showAddPortfolioTag();
    else if (type === 'bulk-upload')   showBulkUploadWatchlist();
    else                               showAddInvestmentPurpose();
  };

  const handleListsOption = (type: ListsDialType) => {
    setOpen(false);
    if (type === 'list') showAddList();
    else if (type === 'list-item' && activeListId) showAddListItem(activeListId);
  };

  const handleNotesOption = (type: NotesDialType) => {
    setOpen(false);
    if (type === 'note') showAddNote();
    else if (type === 'notebook') showAddNoteTag(null, 'area');
    else if (type === 'tag-preset') showTagPresets();
    else if (type === 'sticky') addSticky();
    else showAddNoteTag(null, 'tag');
  };

  const handleFitnessOption = (_type: FitnessDialType) => {
    setOpen(false);
    showAddActivity();
  };

  if (activeView === 'portfolio' && portfolioChartOpen) return null;

  const dialClass = `${styles.speedDial} ${open ? styles.speedDialOpen : ''}`;

  // The Endeavours section (docs/features/endeavours.md, 2026-10-30): on a home, the things made
  // there most often, filed under it (the rest are in the home's own add row); on the page, a new
  // Endeavour or one from a template. N still makes a task on a home straight away.
  if (activeView === 'endeavours') {
    const ui = useUIStore.getState();
    const home = useUIStore.getState().endeavourHomeId as CollectionId | null;
    const opts: { key: string; label: string; color: string; Icon: IconType; run: () => void }[] = home ? [
      { key: 'inside',   label: LABELS.endeavourHome.add.endeavour, color: 'var(--color-swatch-green)', Icon: EndeavourIcon, run: () => ui.showAddCollection() },
      { key: 'notebook', label: LABELS.endeavourHome.add.notebook,  color: 'var(--color-swatch-purple)', Icon: NotebookIcon, run: () => ui.showAddNoteTag(null, 'area') },
      { key: 'goal',     label: LABELS.endeavourHome.add.goal,      color: 'var(--color-swatch-orange)', Icon: GoalIcon, run: () => ui.showAddGoal(home) },
      { key: 'event',    label: LABELS.endeavourHome.add.event,     color: 'var(--color-swatch-teal)', Icon: CalendarIcon, run: () => ui.showAddCalendarItem() },
      { key: 'task',     label: LABELS.endeavourHome.add.task,      color: 'var(--color-swatch-indigo)', Icon: PlusIcon, run: () => ui.showAddTask() },
    ] : [
      { key: 'template', label: LABELS.restructure.fromTemplate,    color: 'var(--color-swatch-purple)', Icon: PresetIcon, run: () => ui.showTemplates(null) },
      { key: 'new',      label: LABELS.endeavourHome.create,        color: 'var(--color-swatch-indigo)', Icon: PlusIcon, run: () => ui.showAddCollection() },
    ];
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {opts.map((opt) => (
            <div key={opt.key} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => { setOpen(false); opt.run(); }}
                aria-label={opt.label}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label={home ? LABELS.endeavourHome.addHere : LABELS.endeavourHome.create}
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'overview') {
    return (
      <div className={dialClass} ref={ref}>
        <button className={styles.fab} onClick={() => useUIStore.getState().showAddOverview()} aria-label={LABELS.overview.newTitle}>
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'lists') {
    const listsOpts = activeListId ? LISTS_OPTIONS : LISTS_OPTIONS.filter((o) => o.type !== 'list-item');
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {listsOpts.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleListsOption(opt.type)}
                aria-label={opt.label}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add to lists"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'calendar') {
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          <TypeOptions onPick={() => setOpen(false)} />
          {CAL_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleCalOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add calendar item"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'portfolio') {
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {PORTFOLIO_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handlePortfolioOption(opt.type)}
                aria-label={`Add ${opt.label}`}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add portfolio item"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'records') {
    // Hide "entry" if no tracker is selected
    const recOpts = activeTrackerId
      ? REC_OPTIONS
      : REC_OPTIONS.filter((o) => o.type !== 'entry');

    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {recOpts.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleRecOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add record"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'notes') {
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {NOTES_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleNotesOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add note"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  if (activeView === 'fitness') {
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {FITNESS_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleFitnessOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                <opt.Icon className={styles.optionIcon} />
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.fab}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add activity"
          aria-expanded={open}
        >
          <span className={styles.fabIcon}><PlusIcon /></span>
        </button>
      </div>
    );
  }

  return (
    <div className={dialClass} ref={ref}>
      <div className={styles.options} role="group" aria-label="Create options">
        <TypeOptions onPick={() => setOpen(false)} />
        {TASK_OPTIONS.map((opt) => (
          <div key={opt.type} className={styles.optionRow}>
            <span className={styles.optionLabel}>{opt.label}</span>
            <button
              className={styles.optionBtn}
              style={{ background: opt.color }}
              onClick={() => handleTaskOption(opt.type)}
              aria-label={`Create ${opt.label}`}
            >
              <opt.Icon className={styles.optionIcon} />
            </button>
          </div>
        ))}
      </div>
      <button
        className={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-label="Add task"
        aria-expanded={open}
      >
        <span className={styles.fabIcon}><PlusIcon /></span>
      </button>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { usePlatform } from '@/hooks/usePlatform';
import { todayIso } from '@/utils/date';
import type { CalendarItemKind } from '@/types';
import { LABELS } from '@/config/labels';
import styles from './AddTaskButton.module.css';

type TaskDialType      = 'tag' | 'collection' | 'purpose' | 'task';
type CalDialType       = 'event' | 'reminder';
type RecordsDialType   = 'tracker' | 'entry' | 'routine';
type PortfolioDialType = 'watchlist-item' | 'portfolio-tag' | 'investment-purpose' | 'bulk-upload';

const TASK_OPTIONS: { type: TaskDialType; label: string; color: string; icon: string }[] = [
  { type: 'tag',        label: 'Tag',              color: '#8b5cf6', icon: '#' },
  { type: 'collection', label: LABELS.collection,  color: '#10b981', icon: '▤' },
  { type: 'purpose',    label: 'Purpose',          color: '#f97316', icon: '◎' },
  { type: 'task',       label: 'Task',             color: '#5b6ee1', icon: '+' },
];

const CAL_OPTIONS: { type: CalDialType; label: string; color: string; icon: string }[] = [
  { type: 'reminder', label: LABELS.calendarItemKind.reminder, color: '#10b981', icon: '◉' },
  { type: 'event',    label: LABELS.calendarItemKind.event,    color: '#5b6ee1', icon: '+' },
];

const REC_OPTIONS: { type: RecordsDialType; label: string; color: string; icon: string }[] = [
  { type: 'routine', label: LABELS.routine,  color: '#f97316', icon: '↺' },
  { type: 'tracker', label: LABELS.tracker,  color: '#10b981', icon: '▦' },
  { type: 'entry',   label: 'New entry',     color: '#5b6ee1', icon: '+' },
];

const PORTFOLIO_OPTIONS: { type: PortfolioDialType; label: string; color: string; icon: string }[] = [
  { type: 'investment-purpose', label: LABELS.investmentPurpose, color: '#8b5cf6', icon: '◎' },
  { type: 'portfolio-tag',      label: LABELS.portfolioTag,      color: '#10b981', icon: '#' },
  { type: 'bulk-upload',        label: 'Bulk Import',            color: '#64748b', icon: '↑' },
  { type: 'watchlist-item',     label: LABELS.watchlistItem,     color: '#5b6ee1', icon: '+' },
];

type ListsDialType = 'list' | 'list-item';
const LISTS_OPTIONS: { type: ListsDialType; label: string; color: string; icon: string }[] = [
  { type: 'list',      label: 'New list',  color: '#10b981', icon: '▤' },
  { type: 'list-item', label: 'Add item',  color: '#5b6ee1', icon: '+' },
];

type NotesDialType = 'note' | 'notebook' | 'custom-tag' | 'tag-preset';
const NOTES_OPTIONS: { type: NotesDialType; label: string; color: string; icon: string }[] = [
  { type: 'notebook',   label: 'Notebook',   color: '#8b5cf6', icon: '📓' },
  { type: 'custom-tag', label: 'Custom tag', color: '#10b981', icon: '#' },
  { type: 'tag-preset', label: 'Tag presets', color: '#64748b', icon: '✦' },
  { type: 'note',       label: 'Note',       color: '#5b6ee1', icon: '+' },
];

type FitnessDialType = 'activity';
const FITNESS_OPTIONS: { type: FitnessDialType; label: string; color: string; icon: string }[] = [
  { type: 'activity', label: LABELS.activity, color: '#5b6ee1', icon: '+' },
];

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
    else showAddNoteTag(null, 'tag');
  };

  const handleFitnessOption = (_type: FitnessDialType) => {
    setOpen(false);
    showAddActivity();
  };

  if (activeView === 'portfolio' && portfolioChartOpen) return null;

  const dialClass = `${styles.speedDial} ${open ? styles.speedDialOpen : ''}`;

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
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
        </button>
      </div>
    );
  }

  if (activeView === 'calendar') {
    return (
      <div className={dialClass} ref={ref}>
        <div className={styles.options} role="group" aria-label="Create options">
          {CAL_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleCalOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
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
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
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
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
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
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
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
                {opt.icon}
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
          <span className={styles.fabIcon}>+</span>
        </button>
      </div>
    );
  }

  return (
    <div className={dialClass} ref={ref}>
      <div className={styles.options} role="group" aria-label="Create options">
        {TASK_OPTIONS.map((opt) => (
          <div key={opt.type} className={styles.optionRow}>
            <span className={styles.optionLabel}>{opt.label}</span>
            <button
              className={styles.optionBtn}
              style={{ background: opt.color }}
              onClick={() => handleTaskOption(opt.type)}
              aria-label={`Create ${opt.label}`}
            >
              {opt.icon}
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
        <span className={styles.fabIcon}>+</span>
      </button>
    </div>
  );
}

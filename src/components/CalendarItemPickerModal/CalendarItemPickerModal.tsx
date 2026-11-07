import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { addDaysToIso, formatDate, todayIso } from '@/utils/date';
import { expandRepeat } from '@/utils/recurrence';
import { EVENT_LINK_KINDS, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import { rankSearch, rankSuggestions, type RankField } from '@/utils/suggestRank';
import type { RepeatConfig } from '@/types';
// Same look as the note, list and task pickers, so the "link a …" dialogs read as one family.
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';
import own from './CalendarItemPickerModal.module.css';
import { CloseIcon } from '@/components/Icons';
import { DateChecklist } from '@/components/DateChecklist/DateChecklist';

export interface CalendarItemPick {
  type:       EventTargetType;
  id:         string;
  kind:       EventLinkKind;
  // One date of a repeating item (the link names it); null: the whole item (all its dates).
  occurrence: string | null;
}

interface Candidate {
  type:       EventTargetType;
  id:         string;
  title:      string;
  notes:      string;
  endeavour:  string;
  date:       string;
  occurrence: string | null;
  base:       string;
  repeat:     RepeatConfig | null;
}

// Reopening a series already chosen (the add-task form's link, clicked: 2026-11-07), on its dates.
export interface CalendarPickerStart { type: EventTargetType; id: string; kind: EventLinkKind; dates: string[] | 'all' }

interface Props {
  // Title of the task being linked from: its keywords order the list while the search is empty.
  suggestFrom?: string;
  excludeIds:   ReadonlySet<string>;
  // Dates of a series already linked (`type:id:date`, `type:id:` for all its dates): shown ticked.
  linked?:      ReadonlySet<string>;
  // One pick, or for a repeating item one per date chosen (or one for all its dates).
  onPick:       (picks: CalendarItemPick[]) => void;
  onClose:      () => void;
  start?:       CalendarPickerStart;
}

// A repeating item's next date from today (within a year and a bit), else its own date.
function nextDate(date: string, repeat: RepeatConfig | null, today: string): { date: string; occurrence: string | null } {
  if (!repeat) return { date, occurrence: null };
  const next = expandRepeat(date, repeat, today, addDaysToIso(today, 400))[0];
  return next ? { date: next, occurrence: next } : { date, occurrence: null };
}

// The "link a calendar item" search dialog: a task linked to an event, Reminder or Deadline from the task's
// side (2026-11-07; the other side is the event pane's Tasks). How it relates is chosen here
// (Preparation: due when it starts; Follow-up: starts when it ends; Related). Ordered like every
// picker (utils/suggestRank.ts): suggestions from the task's title, then the rest, coming up soonest
// first, then the past. A task's own calendar entries and archived items aren't offered.
// How many of a series' dates show at first, and how many more each "Show more" adds (the user,
// 2026-11-07: a long series shouldn't make a list hundreds long); how far ahead they're read.
const DATES_PAGE = 20;
const DATES_AHEAD_DAYS = 730;

// A series' dates from today, as far ahead as the list reads.
const datesOf = (base: string, repeat: RepeatConfig) => { const today = todayIso(); return expandRepeat(base, repeat, today, addDaysToIso(today, DATES_AHEAD_DAYS)); };

// The candidate for one item, read once when the picker reopens on it.
function startCandidate(start: CalendarPickerStart): Candidate | null {
  const s = useCalendarStore.getState();
  const item = (start.type === 'event' ? s.events : start.type === 'reminder' ? s.reminders : s.deadlines)[start.id as never] as
    { title: string; notes: string | null; date: string; repeat: RepeatConfig | null } | undefined;
  if (!item?.repeat) return null;
  return { type: start.type, id: start.id, title: item.title, notes: item.notes ?? '', endeavour: '', date: item.date, occurrence: null, base: item.date, repeat: item.repeat };
}

export function CalendarItemPickerModal({ suggestFrom, excludeIds, linked, onPick, onClose, start }: Props) {
  const events = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const collections = useTaskStore((s) => s.collections);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<EventLinkKind>(start?.kind ?? 'prepFor');
  const [highlightIndex, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // A repeating item picked: which of its dates (none ticked at first), then Link.
  const [series, setSeries] = useState<Candidate | null>(() => (start ? startCandidate(start) : null));
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => {
    const c = start ? startCandidate(start) : null;
    if (!start || !c?.repeat) return new Set();
    return new Set(start.dates === 'all' ? datesOf(c.base, c.repeat) : start.dates);
  });
  const L = LABELS.taskLinks;

  useEscapeClose(onClose);

  const { results, suggested, keywords } = useMemo(() => {
    const today = todayIso();
    const endeavour = (id: string | null) => (id ? collections[id as never]?.name ?? '' : '');
    const candidates: Candidate[] = [
      ...Object.values(events).filter((e) => !e.archivedAt && e.eventType !== 'task' && !excludeIds.has(e.id))
        .map((e): Candidate => ({ type: 'event', id: e.id, title: e.title, notes: e.notes ?? '', endeavour: endeavour(e.collectionId), ...nextDate(e.date, e.repeat, today), base: e.date, repeat: e.repeat })),
      ...Object.values(reminders).filter((r) => !r.archivedAt && r.reminderType !== 'task' && !excludeIds.has(r.id))
        .map((r): Candidate => ({ type: 'reminder', id: r.id, title: r.title, notes: r.notes ?? '', endeavour: endeavour(r.collectionId), ...nextDate(r.date, r.repeat, today), base: r.date, repeat: r.repeat })),
      ...Object.values(deadlines).filter((d) => !d.archivedAt && d.deadlineType !== 'task' && !excludeIds.has(d.id))
        .map((d): Candidate => ({ type: 'deadline', id: d.id, title: d.title, notes: d.notes ?? '', endeavour: endeavour(d.collectionId), ...nextDate(d.date, d.repeat, today), base: d.date, repeat: d.repeat })),
    ];
    const fieldsOf = (c: Candidate): RankField[] => [
      { text: c.title, weight: 3 },
      { text: c.endeavour, weight: 2 },
      { text: c.notes, weight: 1, counted: true },
    ];
    // Coming up first, soonest first; then the past, latest first.
    const orderOf = (c: Candidate) => { const t = Date.parse(`${c.date}T00:00:00Z`); return c.date >= today ? 2e13 - t : t; };
    if (query.trim()) return { results: rankSearch(candidates, fieldsOf, orderOf, query), suggested: 0, keywords: [] };
    const r = rankSuggestions(candidates, fieldsOf, orderOf, suggestFrom);
    return { results: r.items, suggested: r.suggested, keywords: r.keywords };
  }, [events, reminders, deadlines, collections, excludeIds, query, suggestFrom]);

  const lastIndex = Math.max(0, results.length - 1);
  if (highlightIndex > lastIndex) setHighlight(lastIndex);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, results]);

  const pick = (c: Candidate) => {
    if (c.repeat) { setSeries(c); setChosen(new Set()); return; }
    onPick([{ type: c.type, id: c.id, kind, occurrence: null }]);
    onClose();
  };
  const seriesDates = useMemo(() => (series?.repeat ? datesOf(series.base, series.repeat) : []), [series]);
  const wasLinked = (date: string) => !!series && !!linked?.has(`${series.type}:${series.id}:${date}`);
  const toggleDate = (date: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(date)) next.delete(date); else next.add(date); return next; });
  // Every date ticked (none linked before) is the whole series, its later dates too: one link.
  const open = seriesDates.filter((d) => !wasLinked(d));
  const allTicked = open.length > 0 && open.every((d) => chosen.has(d));
  const linkChosen = () => {
    if (!series || !chosen.size) return;
    if (allTicked && open.length === seriesDates.length) onPick([{ type: series.type, id: series.id, kind, occurrence: null }]);
    else onPick([...chosen].sort().map((d) => ({ type: series.type, id: series.id, kind, occurrence: d })));
    onClose();
  };
  // Ticks every date (or, all ticked, none), so one or two can be unticked before Link.
  const tickAll = () => setChosen(allTicked ? new Set() : new Set(open));
  const pickHighlighted = () => { if (series) { linkChosen(); return; } const c = results[highlightIndex]; if (c) pick(c); };

  // Capture phase + stopImmediatePropagation, as in NotePickerModal: the form underneath binds
  // Ctrl+Enter to its own action and must not also answer while this is on top.
  const pickRef = useRef(pickHighlighted);
  useEffect(() => { pickRef.current = pickHighlighted; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pickRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => Math.min(i + 1, lastIndex)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickHighlighted(); }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={L.calendarPickerTitle}>
        <div className={styles.header}>
          <span className={styles.title}>{ITEM_TYPE_ICON.event} {L.calendarPickerTitle}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={L.close}><CloseIcon /></button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={L.calendarPickerSearch}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={handleKeyDown}
        />

        <div className={own.kinds} role="radiogroup" aria-label={L.event.kindLabel}>
          <span className={own.kindsLabel} aria-hidden="true">{L.event.kindLabel}</span>
          {EVENT_LINK_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} title={L.calendarKindHints[k]}
              className={`${own.kind} ${kind === k ? own.kindOn : ''}`} onClick={() => setKind(k)}>
              {L.event.kinds[k]}
            </button>
          ))}
        </div>

        {series ? (
          <div className={own.dates}>
            <div className={own.datesHead}>
              <button type="button" className={own.back} onClick={() => setSeries(null)}>{L.calendarBack}</button>
              <span className={own.datesTitle}>{L.calendarWhichDates(series.title)}</span>
            </div>
            {seriesDates.length === 0 ? <p className={styles.empty}>{L.calendarNoDates}</p> : (
              <DateChecklist key={`${series.type}:${series.id}`} dates={seriesDates} label={L.calendarWhichDates(series.title)} pageSize={DATES_PAGE}
                locked={new Map(seriesDates.filter(wasLinked).map((d) => [d, L.calendarAlreadyLinked]))}
                checked={(d) => wasLinked(d) || chosen.has(d)} onToggle={toggleDate} />
            )}
            <div className={own.dateActions}>
              <button type="button" className={own.allBtn} onClick={tickAll} disabled={!!linked?.has(`${series.type}:${series.id}:`) || open.length === 0}>{allTicked ? L.calendarNoneDates : L.calendarAllDates}</button>
              <button type="button" className={own.linkBtn} onClick={linkChosen} disabled={!chosen.size}>{L.calendarLinkDates(chosen.size)}</button>
            </div>
          </div>
        ) : (
        <div className={styles.results} ref={listRef}>
          {results.length === 0 && <div className={styles.empty}>{L.calendarPickerEmpty}</div>}
          {results.map((c, i) => {
            const active = i === highlightIndex;
            const meta = [formatDate(c.date), c.repeat ? L.calendarRepeats : null, c.endeavour || null].filter(Boolean).join(' · ');
            return (
              <Fragment key={`${c.type}:${c.id}`}>
              {suggested > 0 && i === 0 && <div className={styles.sectionLabel}>{LABELS.pickers.suggestedFrom(keywords)}</div>}
              {suggested > 0 && i === suggested && <div className={styles.sectionLabel}>{LABELS.pickers.recent}</div>}
              <div
                data-active={active || undefined}
                className={`${styles.result} ${active ? styles.resultActive : ''}`}
                onMouseEnter={() => setHighlight(i)}
              >
                <button type="button" className={styles.resultMain} onClick={() => pick(c)}>
                  <span className={styles.resultTop}>
                    <span className={styles.resultTitle}>{ITEM_TYPE_ICON[c.type]} {c.title}</span>
                  </span>
                  <span className={styles.resultPath}>{meta}</span>
                </button>
              </div>
              </Fragment>
            );
          })}
        </div>
        )}

        <div className={styles.footer}>{series ? L.calendarDatesFooter : L.calendarPickerFooter}</div>
      </div>
    </div>,
    document.body,
  );
}

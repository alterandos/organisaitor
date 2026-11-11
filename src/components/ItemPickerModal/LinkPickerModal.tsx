import { useMemo, useState } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { DateChecklist } from '@/components/DateChecklist/DateChecklist';
import { LINK_TARGETS, useLinkSnapshot, type PickerCandidate } from '@/services/linkTargets';
import { addDaysToIso, todayIso } from '@/utils/date';
import { expandRepeat } from '@/utils/recurrence';
import { EVENT_LINK_KINDS, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { LABELS } from '@/config/labels';
import type { CrossAppRefType, RepeatConfig } from '@/types';
import { ItemPickerModal, PickerChoices } from './ItemPickerModal';
import { rankPicker } from './rankPicker';
import own from './LinkPickerModal.module.css';

// The "link a …" picker for the kinds in services/linkTargets.ts that have a `picker` (a task, a
// list, a calendar item: events, Reminders and Deadlines together). Notes are picked with
// NotePickerModal, the note kind's own picker (its tab-aware ranking and "place a new note").
//
// With `relation` it asks how the link relates first (a task to a calendar item: Preparation, due
// when it starts; Follow-up, starts when it ends; Related), and a repeating item goes on to a second
// step: which of its dates (none ticked at first, 20 at a time, "All dates"; dates already linked
// shown ticked and locked). Ticking every date that wasn't linked before is one link to the whole
// series, its later dates too.

export interface LinkPick {
  type:       CrossAppRefType;
  id:         string;
  // One date of a repeating item (the link names it); null: the whole item (all its dates).
  occurrence: string | null;
}
export interface CalendarItemPick extends LinkPick { type: EventTargetType; kind: EventLinkKind }

// Reopening a series already chosen (the add-task form's link, clicked: 2026-11-07), on its dates.
export interface PickerStart { type: EventTargetType; id: string; kind: EventLinkKind; dates: string[] | 'all' }

// How many of a series' dates show at first, and how many more each "Show more" adds (the user,
// 2026-11-07: a long series shouldn't make a list hundreds long); how far ahead they're read.
const DATES_PAGE = 20;
const DATES_AHEAD_DAYS = 730;
const datesOf = (base: string, repeat: RepeatConfig) => { const today = todayIso(); return expandRepeat(base, repeat, today, addDaysToIso(today, DATES_AHEAD_DAYS)); };

type Common = {
  kinds:        CrossAppRefType[];
  // Title of the item being linked from: its keywords order the list while the search is empty.
  suggestFrom?: string;
  excludeIds:   ReadonlySet<string>;
  title?:       string;
  onClose:      () => void;
};

type Props = Common & (
  | { relation?: undefined; onPick: (picks: LinkPick[]) => void }
  | {
      // How it relates is chosen (a calendar item linked from a task), and a series' dates.
      relation:  EventLinkKind;
      // Dates of a series already linked (`type:id:date`, `type:id:` for all its dates): shown ticked.
      linked?:   ReadonlySet<string>;
      start?:    PickerStart;
      onPick:    (picks: CalendarItemPick[]) => void;
    }
);

export function LinkPickerModal(props: Props) {
  const { kinds, suggestFrom, excludeIds, onClose } = props;
  const snap = useLinkSnapshot();
  const [query, setQuery] = useState('');
  const withRelation = props.relation !== undefined;
  const start = withRelation ? props.start : undefined;
  const linked = withRelation ? props.linked : undefined;
  const [kind, setKind] = useState<EventLinkKind>(start?.kind ?? props.relation ?? 'related');
  const labels = LINK_TARGETS[kinds[0]].picker!.labels;
  const L = LABELS.taskLinks;

  const candidates = useMemo(() => {
    const today = todayIso();
    return kinds.flatMap((k) => LINK_TARGETS[k].picker?.candidates(snap, excludeIds, today) ?? []);
  }, [kinds, snap, excludeIds]);

  // A repeating item picked: which of its dates (none ticked at first), then Link.
  const startCandidate = (): PickerCandidate | null => {
    if (!start) return null;
    const c = LINK_TARGETS[start.type].picker?.candidates(snap, new Set(), todayIso()).find((x) => x.id === start.id);
    return c?.series ? c : null;
  };
  const [series, setSeries] = useState<PickerCandidate | null>(startCandidate);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => {
    const c = startCandidate();
    if (!start || !c?.series) return new Set();
    return new Set(start.dates === 'all' ? datesOf(c.series.base, c.series.repeat) : start.dates);
  });

  const { rows, sections } = useMemo(
    () => rankPicker(candidates, (c) => c.fields, (c) => c.order, query, suggestFrom),
    [candidates, query, suggestFrom],
  );

  const done = (picks: LinkPick[]) => {
    if (props.relation !== undefined) props.onPick(picks.map((p) => ({ ...p, type: p.type as EventTargetType, kind })));
    else props.onPick(picks);
    onClose();
  };
  const pick = (c: PickerCandidate) => {
    if (withRelation && c.series) { setSeries(c); setChosen(new Set()); return; }
    done([{ type: c.type, id: c.id, occurrence: null }]);
  };

  const seriesDates = useMemo(() => (series?.series ? datesOf(series.series.base, series.series.repeat) : []), [series]);
  const wasLinked = (date: string) => !!series && !!linked?.has(`${series.type}:${series.id}:${date}`);
  const toggleDate = (date: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(date)) next.delete(date); else next.add(date); return next; });
  const open = seriesDates.filter((d) => !wasLinked(d));
  const allTicked = open.length > 0 && open.every((d) => chosen.has(d));
  const linkChosen = () => {
    if (!series || !chosen.size) return;
    if (allTicked && open.length === seriesDates.length) done([{ type: series.type, id: series.id, occurrence: null }]);
    else done([...chosen].sort().map((d) => ({ type: series.type, id: series.id, occurrence: d })));
  };
  // Ticks every date (or, all ticked, none), so one or two can be unticked before Link.
  const tickAll = () => setChosen(allTicked ? new Set() : new Set(open));

  const title = props.title ?? labels.title;
  const kindIcon = LINK_TARGETS[kinds[0]].icon;

  return (
    <ItemPickerModal
      label={title}
      heading={props.title ?? `${kindIcon} ${title}`}
      query={query}
      onQuery={setQuery}
      search={labels.search}
      rows={rows}
      sections={sections}
      keyOf={(c) => `${c.type}:${c.id}`}
      render={(c) => ({
        title: <>{c.locked ? '🔒 ' : ''}{c.icon ? <ItemIcon icon={c.icon} /> : LINK_TARGETS[c.type].icon} {c.title}</>,
        meta: c.meta || undefined,
      })}
      onPick={pick}
      onClose={onClose}
      empty={labels.empty}
      above={withRelation ? (
        <PickerChoices label={L.event.kindLabel} value={kind} onChange={setKind}
          options={EVENT_LINK_KINDS.map((k) => ({ value: k, label: L.event.kinds[k], hint: L.calendarKindHints[k] }))} />
      ) : undefined}
      step={series ? (
        <div className={own.dates}>
          <div className={own.datesHead}>
            <button type="button" className={own.back} onClick={() => setSeries(null)}>{L.calendarBack}</button>
            <span className={own.datesTitle}>{L.calendarWhichDates(series.title)}</span>
          </div>
          {seriesDates.length === 0 ? <p className={own.none}>{L.calendarNoDates}</p> : (
            <DateChecklist key={`${series.type}:${series.id}`} dates={seriesDates} label={L.calendarWhichDates(series.title)} pageSize={DATES_PAGE}
              locked={new Map(seriesDates.filter(wasLinked).map((d) => [d, L.calendarAlreadyLinked]))}
              checked={(d) => wasLinked(d) || chosen.has(d)} onToggle={toggleDate} />
          )}
          <div className={own.dateActions}>
            <button type="button" className={own.allBtn} onClick={tickAll} disabled={!!linked?.has(`${series.type}:${series.id}:`) || open.length === 0}>{allTicked ? L.calendarNoneDates : L.calendarAllDates}</button>
            <button type="button" className={own.linkBtn} onClick={linkChosen} disabled={!chosen.size}>{L.calendarLinkDates(chosen.size)}</button>
          </div>
        </div>
      ) : undefined}
      onStepSubmit={linkChosen}
      footer={series ? L.calendarDatesFooter : labels.footer}
    />
  );
}

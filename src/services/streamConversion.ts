import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore, buildDeadline, buildEvent } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { onLoaded } from '@/services/sync/hydrating';
import { streamDates, tickIndex, type Tick } from '@/utils/rhythms';
import { followedDates } from '@/utils/repeatFollow';
import { expandRepeat } from '@/utils/recurrence';
import { addDaysToIso } from '@/utils/date';
import { newCalendarDeadlineId, newCalendarEventId } from '@/utils/id';
import { WORTH_FIELD } from '@/utils/subjectItems';
import type { CalendarDeadline, CalendarEvent, CalendarEventId, Collection, CollectionId, CrossAppRef, GoalMeasure, RepeatConfig, RhythmStream } from '@/types';

// Rhythm streams converted to repeating calendar items (docs/features/endeavours.md phase 7 (e),
// decided with the user 2026-10-30: automatic, as Schedules were in (c)). For each routine with
// streams, every stream but the routine's own becomes:
//   - do-by and hand-in streams: repeating Work (a Deadline filed where the routine was), its done
//     ticks its done dates, its skipped and not-needed ones skipped dates;
//   - an attend stream following classes: attended marks on those classes; one with its own repeat:
//     a repeating class (an event), its done ticks attended.
// A tick holding a Type's values or a note becomes that date taken out of the series ("only this
// one"), with those values and a link to the note. Goals keeping up a stream keep up its new item.
// The routine keeps only its own stream (as before it had streams); one that was nothing but its
// streams (no steps, no own stream) is archived. Its ticks stay in Records, untouched.
//
// Ids are ordinary new ones (the user, 2026-10-30: nothing of theirs left to convert, so no
// fixed-id exception); each record is stamped with the routine's own time, so a conversion never
// beats a real edit in the sync merge.

const LOOKAHEAD_DAYS = 400;

const isOwn = (c: Collection, s: RhythmStream) => s.id === c.id;

function withSkips(repeat: RepeatConfig, dates: string[]): RepeatConfig {
  return dates.length ? { ...repeat, exceptions: [...new Set([...(repeat.exceptions ?? []), ...dates])].sort() } : repeat;
}

export function convertRhythmStreams(): number {
  const tasks = useTaskStore.getState();
  const routines = Object.values(tasks.collections).filter((c) => c.kind === 'routine' && c.streams?.length);
  if (!routines.length) return 0;
  const cal = useCalendarStore.getState();
  const { events, deadlines } = cal;
  const schedules = useScheduleStore.getState().schedules;
  const ticks = tickIndex(useTrackerStore.getState().entries, tasks.collections);
  const newEvents: CalendarEvent[] = [];
  const newDeadlines: CalendarDeadline[] = [];
  const attended = new Map<string, Set<string>>();   // event id → dates attended
  const itemOf = new Map<string, string>();           // `${routine}|${stream}` → its new item's id
  let made = 0;

  for (const c of routines) {
    const ts = c.updatedAt;
    const target = c.collectionId;
    const ticksOf = (s: RhythmStream) => [...ticks.entries()]
      .filter(([k]) => k.startsWith(`${c.id}|${s.id}|`))
      .map(([k, t]) => ({ date: k.slice(k.lastIndexOf('|') + 1), tick: t }));
    for (const s of c.streams!) {
      if (isOwn(c, s)) continue;
      const all = ticksOf(s);
      const done = all.filter((x) => x.tick.status === 'done').map((x) => x.date);
      const skipped = all.filter((x) => x.tick.status === 'skipped' || x.tick.status === 'notNeeded').map((x) => x.date);
      const detailed = all.filter((x) => Object.keys(x.tick.fields).length > 0 || x.tick.noteId);
      const typeFields = (extra: Record<string, unknown> = {}) => ({ ...(s.worth ? { [WORTH_FIELD]: s.worth } : {}), ...extra });
      const refs = (t: Tick): CrossAppRef[] => (t.noteId ? [{ type: 'note', id: t.noteId }] : []);

      // An attend stream following classes: its ticks are attended marks on them.
      if (s.kind === 'attend' && s.rule.kind === 'follows') {
        const rule = s.rule;
        for (const d of done) {
          const on = addDaysToIso(d, -rule.offsetDays);
          const copy = Object.values(events).find((e) => e.seriesId && rule.eventIds.includes(e.seriesId) && e.date === on);
          const series = rule.eventIds.map((id) => events[id as CalendarEventId]).find((e) => e && (e.date === on || (e.repeat && expandRepeat(e.date, e.repeat, on, on).length > 0)));
          const at = copy ?? series;
          if (at) attended.set(at.id, (attended.get(at.id) ?? new Set()).add(on));
        }
        continue;
      }
      if (s.rule.kind === 'relative') continue;   // converted to 'follows' with the Schedules (c); none should be left

      const repeat: RepeatConfig = s.rule.kind === 'repeat' ? s.rule.repeat : {
        freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null,
        dates: followedDates({ ids: s.rule.eventIds, offsetDays: s.rule.offsetDays }, events),
        follows: { ids: s.rule.eventIds, offsetDays: s.rule.offsetDays },
      };
      const first = (s.rule.kind === 'follows' ? repeat.dates?.[0] : streamDates(s, schedules, s.start, addDaysToIso(s.start, LOOKAHEAD_DAYS), events)[0]) ?? s.start;
      const taken = detailed.map((x) => x.date);

      if (s.kind === 'attend') {
        const id = newCalendarEventId();
        itemOf.set(`${c.id}|${s.id}`, id);
        if (events[id]) continue;
        newEvents.push({ ...buildEvent({ title: s.label, date: first, startTime: s.time, collectionId: target, repeat: withSkips(repeat, [...skipped, ...taken]) }, id, ts),
          ...(s.typeId ? { typeId: s.typeId, typeFields: typeFields() } : {}), attendedDates: done.filter((d) => !taken.includes(d)) });
        for (const x of detailed) {
          newEvents.push({ ...buildEvent({ title: s.label, date: x.date, startTime: s.time, collectionId: target, seriesId: id, seriesDate: x.date, crossAppRefs: refs(x.tick) }, newCalendarEventId(), ts),
            ...(s.typeId ? { typeId: s.typeId, typeFields: typeFields(x.tick.fields) } : {}), ...(x.tick.status === 'done' ? { attendedDates: [x.date] } : {}) });
        }
      } else {
        const id = newCalendarDeadlineId();
        itemOf.set(`${c.id}|${s.id}`, id);
        if (deadlines[id]) continue;
        const base = { title: s.label, time: s.time, collectionId: target, notify: s.show.notify };
        newDeadlines.push({ ...buildDeadline({ ...base, date: first, repeat: withSkips(repeat, [...skipped, ...taken]), doneDates: done.filter((d) => !taken.includes(d)) }, id, ts),
          ...(s.typeId || s.worth ? { typeId: s.typeId, typeFields: typeFields() } : {}) });
        for (const x of detailed) {
          newDeadlines.push({ ...buildDeadline({ ...base, date: x.date, seriesId: id, seriesDate: x.date, crossAppRefs: refs(x.tick), doneDates: x.tick.status === 'done' ? [x.date] : [] }, newCalendarDeadlineId(), ts),
            ...(s.typeId || s.worth ? { typeId: s.typeId, typeFields: typeFields(x.tick.fields) } : {}) });
        }
      }
      made++;
    }
  }

  cal.putEvents(newEvents);
  cal.putDeadlines(newDeadlines);
  for (const [eid, dates] of attended) {
    const e = useCalendarStore.getState().events[eid as CalendarEventId];
    if (e) useCalendarStore.getState().updateEvent(e.id, { attendedDates: [...new Set([...(e.attendedDates ?? []), ...dates])].sort() });
  }

  // Goals that kept up a stream keep up its new item (any stream of the routine: all of them).
  const goals = useGoalStore.getState();
  for (const g of Object.values(goals.goals)) {
    const m = g.measure;
    if (m.kind !== 'consistency' || !routines.some((c) => c.id === m.rhythmId)) continue;
    const ids = m.streamId ? [itemOf.get(`${m.rhythmId}|${m.streamId}`)] : [...itemOf].filter(([k]) => k.startsWith(`${m.rhythmId}|`)).map(([, v]) => v);
    const itemIds = ids.filter((x): x is string => !!x);
    if (itemIds.length) goals.updateGoal(g.id, { measure: { kind: 'keepUp', itemIds, count: m.count, outOf: m.outOf } satisfies GoalMeasure });
  }

  // The routine keeps its own stream only; one that was nothing but its streams is archived.
  for (const c of routines) {
    const ownKept = c.streams!.some((s) => isOwn(c, s));
    tasks.updateCollection(c.id as CollectionId, { streams: [], ...(!ownKept && !(c.routineTasks ?? []).length ? { archivedAt: new Date().toISOString() } : {}) });
  }
  return made;
}

// Started once from App.tsx: converts now and after each sync load (a stream made on a device
// still on an older build arrives that way).
export function initStreamConversion(): () => void {
  convertRhythmStreams();
  return onLoaded(() => { convertRhythmStreams(); });
}

import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarEvent, CalendarEventId, CollectionId, RepeatConfig } from '@/types';
import { buildCalendarEventInput } from '@/utils/calendarItemInput';
import { withException } from '@/utils/recurrence';
import {
  IMPORTED_FIELD_KEYS, importKeyOf, pickFields, ruleOf, sameField, sameFields,
  type ImportDraft, type ImportedFields,
} from './draft';
import { birthdayKey } from './classify';

// Applying imports to the calendar: the one place that creates, updates or removes an imported
// event (Google sync and the .ics import both come through here). The rules, agreed with the
// user 2026-10-18:
//   - Never a duplicate. An event is found again by its key (source, account, calendar, event
//     id); failing that, the same event from somewhere else is recognised by its iCalendar UID,
//     and the same person's birthday by name and day. A Google event's id is the same on every
//     device (ids.ts), so two devices importing it make one record.
//   - Field by field, the source wins only where the person hasn't edited the event here: each
//     event keeps the fields as last imported (sourceRaw.imported) to tell.
//   - Deleted at the source: removed here (to the Recycling Bin) if never edited, else kept and
//     marked "deleted in Google" (sourceRaw.deleted).
//   - Deleted here: never brought back (importedSourceKeys, plus the cloud's tombstones).
//   - A repeating event is one native series; a date changed at the source is a linked copy
//     (seriesId / seriesDate) and its date is taken out of the series (repeat.exceptions).

export interface ApplyOptions {
  // The id a new event gets (Google: the same on every device); a new id when absent.
  idFor?:        (key: string) => CalendarEventId;
  collectionId?: CollectionId | null;
}

export interface ApplyResult { created: number; updated: number; removed: number }

type Raw = { event?: Record<string, unknown>; imported?: ImportedFields; deleted?: boolean };
const rawOf = (ev: CalendarEvent): Raw => (ev.sourceRaw ?? {}) as Raw;

// The fields as last imported; an event with no record of them counts as never edited.
const baseOf = (ev: CalendarEvent): ImportedFields => rawOf(ev).imported ?? pickFields(ev);

export function untouched(ev: CalendarEvent): boolean {
  return sameFields(pickFields(ev), baseOf(ev));
}

const union = (a: string[] | undefined, b: string[] | undefined) => [...new Set([...(a ?? []), ...(b ?? [])])].sort();

class Index {
  byKey = new Map<string, CalendarEvent>();
  constructor(events: Record<string, CalendarEvent>) {
    for (const ev of Object.values(events)) this.add(ev);
  }
  add(ev: CalendarEvent) {
    const k = importKeyOf(ev);
    if (k) this.byKey.set(k, ev);
  }
  refresh(id: CalendarEventId) {
    const ev = useCalendarStore.getState().events[id];
    if (ev) this.add(ev);
  }
}

// What an import would find already in the calendar for a draft: the same event (to update), or
// the same thing from somewhere else (to leave alone). Used by the .ics review to mark duplicates.
export function findExisting(draft: ImportDraft, events = useCalendarStore.getState().events, idFor?: ApplyOptions['idFor']):
  { kind: 'same'; event: CalendarEvent } | { kind: 'elsewhere'; event: CalendarEvent } | null {
  for (const ev of Object.values(events)) {
    if (importKeyOf(ev) === draft.key) return { kind: 'same', event: ev };
  }
  const byId = idFor ? events[idFor(draft.key)] : undefined;
  if (byId) return { kind: 'elsewhere', event: byId };
  if (draft.uid) {
    const other = Object.values(events).find((ev) => ev.sourceUid === draft.uid);
    if (other) return { kind: 'elsewhere', event: other };
  }
  if (draft.fields.eventType === 'birthday') {
    const k = birthdayKey(draft.fields.title, draft.fields.date);
    const other = Object.values(events).find((ev) => ev.eventType === 'birthday' && !ev.archivedAt && birthdayKey(ev.title, ev.date) === k);
    if (other) return { kind: 'elsewhere', event: other };
  }
  return null;
}

export function applyImport(drafts: ImportDraft[], opts: ApplyOptions = {}): ApplyResult {
  const store = useCalendarStore.getState;
  const result: ApplyResult = { created: 0, updated: 0, removed: 0 };
  const deletedHere = new Set(store().importedSourceKeys);
  const index = new Index(store().events);
  const seen: string[] = [];

  const addException = (master: CalendarEvent, date: string) => {
    if (!master.repeat || master.repeat.exceptions?.includes(date)) return;
    store().updateEvent(master.id, { repeat: withException(master.repeat, date) });
    index.refresh(master.id);
  };

  const remove = (ev: CalendarEvent) => {
    // Marked first, so a copy restored from the Recycling Bin isn't removed again next time.
    store().updateEvent(ev.id, { sourceRaw: { ...rawOf(ev), deleted: true } });
    store().deleteEvent(ev.id);
    index.byKey.delete(importKeyOf(ev) ?? '');
    result.removed++;
  };

  // Series first, so a changed date finds its series.
  const ordered = [...drafts].sort((a, b) => Number(!!a.series) - Number(!!b.series));
  for (const d of ordered) {
    const existing = index.byKey.get(d.key);
    if (!existing && deletedHere.has(d.key)) continue;
    const master = d.series ? index.byKey.get(d.series.key) : undefined;

    if (existing) {
      if (rawOf(existing).deleted) continue;
      if (d.cancelled) {
        if (master) addException(master, d.series!.date);
        if (untouched(existing)) {
          for (const child of Object.values(store().events)) {
            if (child.seriesId === existing.id && child.source === existing.source && untouched(child)) remove(child);
          }
          remove(existing);
        } else {
          store().updateEvent(existing.id, { sourceRaw: { ...rawOf(existing), deleted: true } });
          index.refresh(existing.id);
        }
        continue;
      }
      if (update(existing, d)) result.updated++;
      if (master && existing.seriesDate) addException(master, existing.seriesDate);
      continue;
    }

    if (d.cancelled) {
      if (master) addException(master, d.series!.date);
      continue;
    }

    const found = findExisting(d, store().events, opts.idFor);
    if (found) { seen.push(d.key); continue; }

    let seriesLink: { seriesId: string; seriesDate: string } | null = null;
    if (master && d.series) {
      // The person already changed that date here themselves: theirs stands.
      const own = Object.values(store().events).some((ev) => ev.seriesId === master.id && ev.seriesDate === d.series!.date);
      if (own) { seen.push(d.key); continue; }
      addException(master, d.series.date);
      seriesLink = { seriesId: master.id, seriesDate: d.series.date };
    }

    const id = store().addEvent({
      ...buildCalendarEventInput({ ...d.fields, collectionId: opts.collectionId ?? null }),
      background:         d.fields.background,
      color:              d.fields.color,
      travelMode:         d.fields.travelMode,
      notifyBeforeValue:  d.fields.notifyBeforeValue,
      notifyBeforeUnit:   d.fields.notifyBeforeUnit,
      ...(seriesLink ?? {}),
      source:             d.source,
      sourceAccount:      d.account,
      sourceConnectionId: d.connectionId,
      sourceCalendarId:   d.calendarId,
      sourceEventId:      d.eventId,
      sourceUid:          d.uid,
      sourceRaw:          { event: d.raw, imported: d.fields },
    }, opts.idFor?.(d.key));
    index.refresh(id);
    seen.push(d.key);
    result.created++;
  }

  if (seen.length) store().markImported(seen);
  return result;

  // Takes the source's change for every field not edited here. True if anything changed.
  function update(ev: CalendarEvent, d: ImportDraft): boolean {
    const base = baseOf(ev);
    const local = pickFields(ev);
    const remote = d.fields;
    if (sameFields(remote, base) && d.connectionId === ev.sourceConnectionId) return false;
    const patch: Partial<CalendarEvent> = {};
    for (const k of IMPORTED_FIELD_KEYS) {
      if (k === 'repeat') continue;
      if (sameField(k, local, base) && !sameField(k, remote, base)) (patch as Record<string, unknown>)[k] = remote[k];
    }
    // The rule follows the source while not edited here; dates taken out of it on either side
    // stay out.
    const ruleUnedited = sameField('repeat', local, base);
    const rule: RepeatConfig | null = ruleUnedited ? ruleOf(remote.repeat) : ruleOf(local.repeat);
    if (rule) {
      const next: RepeatConfig = { ...rule, exceptions: union(local.repeat?.exceptions, remote.repeat?.exceptions) };
      if (!next.exceptions?.length) delete next.exceptions;
      if (JSON.stringify(next) !== JSON.stringify(local.repeat)) patch.repeat = next;
    } else if (ruleUnedited && local.repeat) patch.repeat = null;
    store().updateEvent(ev.id, { ...patch, sourceConnectionId: d.connectionId, sourceRaw: { event: d.raw, imported: remote } });
    index.refresh(ev.id);
    return true;
  }
}

// Removes every event imported from one account (Disconnect → "Remove its events"), to the
// Recycling Bin, and forgets them, so connecting the account again imports them afresh.
export function removeImportedEvents(source: string, account: string): number {
  const store = useCalendarStore.getState;
  const gone = Object.values(store().events).filter((ev) => ev.source === source && ev.sourceAccount === account);
  for (const ev of gone) store().deleteEvent(ev.id);
  const prefix = `${source}|${account}|`;
  useCalendarStore.setState((s) => ({ importedSourceKeys: s.importedSourceKeys.filter((k) => !k.startsWith(prefix)) }));
  return gone.length;
}

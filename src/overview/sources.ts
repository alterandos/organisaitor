import { quietRuleTasks, ruleLinkOf } from '@/utils/eventTaskRules';
import { LABELS } from '@/config/labels';
import { INBOX_ICON, QUESTION_ICON, REVIEW_ICON, RHYTHM_ICON, ITEM_TYPE_ICON } from '@/config/itemIcons';
import { BEHIND_DAYS, rhythmOccurrences, tickIndex, isRhythm, isDealtWith } from '@/utils/rhythms';
import { addDaysToIso } from '@/utils/date';
import { expandRepeat, occurrenceTime, seriesDatesAhead } from '@/utils/recurrence';
import { behindDates } from '@/utils/itemOccurrences';
import { getNoteEffectiveCollectionId, getNoteNotebookPath } from '@/utils/notes';
import { collectQuestions } from '@/utils/noteQuestions';
import { collectInboxes, localDay } from '@/utils/noteInboxes';
import type {
  CalendarDeadline, CalendarEvent, CalendarReminder, Collection, RepeatConfig, ScheduleTemplate, Task, TrackerEntry,
} from '@/types';
import type { List, ListItem } from '@/types/lists';
import type { Note, NoteTag } from '@/types/notes';
import type { OverviewPlan, OverviewRow, OverviewSourceKey, OverviewStatus } from '@/types/overview';
import { collectReviewPassages } from '@/utils/noteContent';
import { noteItem, type TaggedItem } from '@/utils/tagScope';
import { eventLinksOf } from '@/utils/eventTaskLinks';

// Every app's contribution to Overview: how its items map onto the common row shape
// (What / When / Status / From / Endeavour). THE registry — a new app, or a new kind of item, is
// one entry here plus its key in OverviewSourceKey and its label in LABELS.overview.sources. The
// engine (engine.ts) and the section only ever see rows, never an app's own types.
//
// Sources are pure functions over a snapshot of the stores (useOverviewSnapshot builds it, with
// encrypted notes/lists already resolved through their views), so they are testable without React.
// Opening an item lives in open.ts — the only part that touches uiStore.

export interface OverviewSnapshot {
  tasks:       Record<string, Task>;
  collections: Record<string, Collection>;
  events:      Record<string, CalendarEvent>;
  reminders:   Record<string, CalendarReminder>;
  deadlines:   Record<string, CalendarDeadline>;
  notes:       Record<string, Note>;          // views: encrypted ones decrypted if unlocked
  noteTags:    Record<string, NoteTag>;
  lists:       Record<string, List>;          // views
  listItems:   Record<string, ListItem>;      // views
  entries:     Record<string, TrackerEntry>;
  schedules?:  Record<string, ScheduleTemplate>;  // timetables: rhythm streams that follow a class
  lockedNoteIds: ReadonlySet<string>;         // encrypted and locked — never shown, only counted
  lockedListIds: ReadonlySet<string>;
}

// `locked`: the Endeavour of each item left out because it's encrypted and locked (Endeavour ids
// stay plaintext), so the section can say how many are hidden under the current filter.
export interface SourceResult { rows: OverviewRow[]; locked: (string | null)[] }

export interface OverviewSourceDef {
  key:   OverviewSourceKey;
  icon:  string;
  label: string;
  rows:  (snap: OverviewSnapshot, today: string) => SourceResult;
  // What a row is for the tag condition (its own tags, its notebooks); absent = its Endeavour only.
  // The Endeavour's tags count either way (utils/tagScope.ts).
  tagged?: (row: OverviewRow, snap: OverviewSnapshot) => TaggedItem;
}

// The note a note-borne row (a question, an inbox item, a review passage) is in: its id's first part.
const noteTagged = (noteId: string, snap: OverviewSnapshot): TaggedItem => {
  const n = snap.notes[noteId];
  return n ? noteItem(n, snap.noteTags) : {};
};

const row = (source: OverviewSourceKey, id: string, r: Omit<OverviewRow, 'key' | 'source' | 'id'>): OverviewRow =>
  ({ key: `${source}:${id}`, source, id, ...r });

// A calendar item's main date and whether it's still ahead: the next occurrence not yet marked
// done for a repeating one (within two years), else its own date — "done" once marked done
// (`doneDates`, reminders and deadlines), "past" once its last day has gone by.
export function calendarWhen(date: string, endDate: string | null, repeat: RepeatConfig | null, today: string, doneDates: string[] = []): { when: string; status: OverviewStatus } {
  const done = new Set(doneDates);
  if (repeat) {
    const next = expandRepeat(date, repeat, today, addDaysToIso(today, 730)).find((d) => !done.has(d));
    return next ? { when: next, status: 'open' } : { when: date, status: 'past' };
  }
  if (done.has(date)) return { when: date, status: 'done' };
  return { when: date, status: (endDate ?? date) < today ? 'past' : 'open' };
}

// A repeating reminder's or deadline's row stands for its next date not yet done, so each date
// already marked done gets a row of its own; otherwise marking one done took it out of an Overview
// showing done items (found 2026-10-19). A one-off item's done date is its own row's.
export function doneOccurrences(repeat: RepeatConfig | null, doneDates: string[]): string[] {
  return repeat ? [...new Set(doneDates)].sort() : [];
}

// A row's timeline drawing (OverviewPlan); anything not given is off.
const plan = (shape: OverviewPlan['shape'], p: Partial<Omit<OverviewPlan, 'shape'>>): OverviewPlan =>
  ({ shape, start: null, endDate: null, endTime: null, important: false, movable: false, ...p });

// A task linked to an event or a Deadline sits under it on the Runway (its first such link).
const underEvent = (t: Task): string | undefined => {
  const l = eventLinksOf(t)[0];
  return l ? `${l.targetType}:${l.targetId}` : undefined;
};

const occurrenceRow = (source: OverviewSourceKey, id: string, date: string, r: Omit<OverviewRow, 'key' | 'source' | 'id'>): OverviewRow =>
  ({ ...row(source, id, r), key: `${source}:${id}@${date}`, occurrence: date });

// A repeating event's, Reminder's or Deadline's later dates, after the one its main row stands for, to the
// series' end or 90 days ahead (seriesDatesAhead): each a quiet row of its own (the user,
// 2026-11-07: Overview showed only the next date of a Schedule's classes).
function laterDates(date: string, repeat: RepeatConfig | null, w: { when: string; status: OverviewStatus }, today: string, archived: boolean, doneDates: string[] = []): string[] {
  if (!repeat || archived || w.status !== 'open') return [];
  const done = new Set(doneDates);
  return seriesDatesAhead(date, repeat, today).filter((d) => d > w.when && !done.has(d));
}

// A repeating item's main row stands for its next date, so it opens there, not at the series' first.
const nextOf = (repeat: RepeatConfig | null, w: { when: string; status: OverviewStatus }) =>
  repeat && w.status === 'open' ? { occurrence: w.when } : {};

export const OVERVIEW_SOURCES: OverviewSourceDef[] = [
  {
    key: 'task', icon: ITEM_TYPE_ICON.task, label: LABELS.overview.sources.task,
    tagged: (r, snap) => ({ tagIds: snap.tasks[r.id]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap) => {
      // A rule's open tasks (utils/eventTaskRules.ts): each a row of the set (`series`), folded under
      // the one due first where rows are listed (overview/series.ts), the rest quiet when shown.
      const quiet = quietRuleTasks(Object.values(snap.tasks));
      const seriesOf = (t: Task) => {
        const l = ruleLinkOf(t);
        if (!l) return {};
        const event = snap.events[l.targetId as never];
        const rule = event?.taskRules?.find((r) => r.id === l.ruleId);
        return { series: { key: `${l.targetId}|${l.ruleId}`, label: LABELS.eventTaskRules.seriesLabel(rule?.title ?? t.title, event?.title ?? '') } };
      };
      return {
      locked: [],
      rows: Object.values(snap.tasks).map((t) => row('task', t.id, {
        title:       t.title,
        ...(quiet.has(t.id) ? { quiet: true } : {}),
        ...seriesOf(t),
        when:        t.deadline ?? t.scheduledAt,
        time:        t.deadline ? t.deadlineTime : t.scheduledTime,
        status:      t.archived ? 'archived' : t.completed ? 'done' : 'open',
        endeavourId: t.collectionId,
        context:     t.parentId ? snap.tasks[t.parentId]?.title ?? null : null,
        // Work toward its deadline from its scheduled day (the work window), else a moment, else undated.
        plan: plan(t.deadline ? 'due' : t.scheduledAt ? 'point' : 'tray', {
          start: t.deadline && t.scheduledAt && t.scheduledAt <= t.deadline ? t.scheduledAt : null,
          important: t.priority === 'high', movable: !t.completed && !t.archived,
          under: underEvent(t),
        }),
      })),
      };
    },
  },
  {
    // A task's own scheduled/deadline shadows are left out — the task row already stands for them.
    key: 'event', icon: ITEM_TYPE_ICON.event, label: LABELS.overview.sources.event,
    tagged: (r, snap) => ({ tagIds: snap.events[r.id]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.events).filter((e) => e.eventType !== 'task').flatMap((e) => {
        const w = calendarWhen(e.date, e.endDate, e.repeat, today);
        const base = {
          title: e.title, time: e.startTime, endeavourId: e.collectionId, context: e.location,
          plan: plan('block', { endDate: e.repeat ? null : e.endDate, endTime: e.endTime, important: e.important, movable: !e.repeat && !e.archivedAt }),
        };
        return [
          row('event', e.id, { ...base, when: w.when, time: occurrenceTime(e.repeat, w.when, e.startTime), status: e.archivedAt ? 'archived' : w.status, ...nextOf(e.repeat, w) }),
          ...laterDates(e.date, e.repeat, w, today, !!e.archivedAt).map((date) => occurrenceRow('event', e.id, date, { ...base, when: date, time: occurrenceTime(e.repeat, date, e.startTime), status: 'open', quiet: true })),
        ];
      }),
    }),
  },
  {
    key: 'reminder', icon: ITEM_TYPE_ICON.reminder, label: LABELS.overview.sources.reminder,
    tagged: (r, snap) => ({ tagIds: snap.reminders[r.id]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.reminders).filter((r) => r.reminderType !== 'task').flatMap((r) => {
        const w = calendarWhen(r.date, null, r.repeat, today, r.doneDates);
        const base = { title: r.title, time: r.time, endeavourId: r.collectionId, context: null, plan: plan('point', { important: r.important, movable: !r.repeat && !r.archivedAt }) };
        return [
          row('reminder', r.id, { ...base, when: w.when, status: r.archivedAt ? 'archived' : w.status, ...nextOf(r.repeat, w) }),
          ...doneOccurrences(r.repeat, r.doneDates).map((date) => occurrenceRow('reminder', r.id, date, { ...base, when: date, status: r.archivedAt ? 'archived' : 'done' })),
          ...laterDates(r.date, r.repeat, w, today, !!r.archivedAt, r.doneDates).map((date) => occurrenceRow('reminder', r.id, date, { ...base, when: date, time: occurrenceTime(r.repeat, date, r.time), status: 'open', quiet: true })),
        ];
      }),
    }),
  },
  {
    key: 'deadline', icon: ITEM_TYPE_ICON.deadline, label: LABELS.overview.sources.deadline,
    tagged: (r, snap) => ({ tagIds: snap.deadlines[r.id]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.deadlines).filter((d) => d.deadlineType !== 'task').flatMap((d) => {
        const w = calendarWhen(d.date, null, d.repeat, today, d.doneDates);
        const base = { title: d.title, time: d.time, endeavourId: d.collectionId, context: null, plan: plan('due', { important: d.important, movable: !d.repeat && !d.archivedAt }) };
        return [
          row('deadline', d.id, { ...base, when: w.when, status: d.archivedAt ? 'archived' : w.status, ...nextOf(d.repeat, w) }),
          ...doneOccurrences(d.repeat, d.doneDates).map((date) => occurrenceRow('deadline', d.id, date, { ...base, when: date, status: d.archivedAt ? 'archived' : 'done' })),
          // Repeating work's missed dates (phase 7 (e)): each its own open row, so it's Behind (for
          // BEHIND_DAYS) and can be ticked done from there.
          ...behindDates(d, today).map((date) => occurrenceRow('deadline', d.id, date, { ...base, when: date, status: 'open' })),
          ...laterDates(d.date, d.repeat, w, today, !!d.archivedAt, d.doneDates).map((date) => occurrenceRow('deadline', d.id, date, { ...base, when: date, time: occurrenceTime(d.repeat, date, d.time), status: 'open', quiet: true })),
        ];
      }),
    }),
  },
  {
    // Reference material rather than something to finish: undated, and "open" while it exists.
    key: 'note', icon: ITEM_TYPE_ICON.note, label: LABELS.overview.sources.note,
    tagged: (r, snap) => noteTagged(r.id, snap),
    rows: (snap) => {
      const notes = Object.values(snap.notes);
      return {
        locked: notes.filter((n) => snap.lockedNoteIds.has(n.id)).map((n) => getNoteEffectiveCollectionId(n, snap.noteTags)),
        rows: notes.filter((n) => !snap.lockedNoteIds.has(n.id)).map((n) => row('note', n.id, {
          title: n.title || '(Untitled)', when: null, time: null,
          status: n.archivedAt ? 'archived' : 'open',
          // Where it lives: its notebook path (a title alone rarely says which note it is).
          endeavourId: getNoteEffectiveCollectionId(n, snap.noteTags), context: getNoteNotebookPath(n, snap.noteTags).join(' › ') || null,
        })),
      };
    },
  },
  {
    key: 'list', icon: ITEM_TYPE_ICON.list, label: LABELS.overview.sources.list,
    tagged: (r, snap) => ({ tagIds: snap.lists[r.id]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap) => {
      const lists = Object.values(snap.lists);
      return {
        locked: lists.filter((l) => snap.lockedListIds.has(l.id)).map((l) => l.collectionId),
        rows: lists.filter((l) => !snap.lockedListIds.has(l.id)).map((l) => row('list', l.id, {
          title: l.name, when: null, time: null, status: 'open',
          endeavourId: l.collectionId, context: LABELS.listKind[l.kind].one,
        })),
      };
    },
  },
  {
    // An item's date is its list's first date field (or its tab's, if the tab has its own fields);
    // its Endeavour is its list's.
    key: 'listItem', icon: ITEM_TYPE_ICON.listItem, label: LABELS.overview.sources.listItem,
    tagged: (r, snap) => ({ tagIds: snap.lists[snap.listItems[r.id]?.listId]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap) => {
      const items = Object.values(snap.listItems);
      const visible = items.filter((i) => snap.lists[i.listId] && !snap.lockedListIds.has(i.listId));
      return {
        locked: items.filter((i) => snap.lockedListIds.has(i.listId)).map((i) => snap.lists[i.listId]?.collectionId ?? null),
        rows: visible.map((i) => {
          const list = snap.lists[i.listId];
          const tab = i.tabId ? list.tabs.find((t) => t.id === i.tabId) : undefined;
          const schema = tab && tab.fieldSchema.length > 0 ? tab.fieldSchema : list.fieldSchema;
          const dateField = schema.find((f) => f.type === 'date');
          const date = dateField ? i.data[dateField.id] : null;
          return row('listItem', i.id, {
            title: i.title,
            when: typeof date === 'string' && date ? date : null,
            time: null,
            status: i.status === 'done' ? 'done' : 'open',
            endeavourId: list.collectionId,
            context: tab ? `${list.name} › ${tab.name}` : list.name,
            // A list item's date says when it happens (a release, a trip), not work due: a moment.
            ...(typeof date === 'string' && date ? { plan: plan('point', {}) } : {}),
          });
        }),
      };
    },
  },
  {
    key: 'trackerEntry', icon: ITEM_TYPE_ICON.trackerEntry, label: LABELS.overview.sources.trackerEntry,
    tagged: (r, snap) => ({ tagIds: snap.collections[snap.entries[r.id]?.trackerId]?.tagIds, collectionId: r.endeavourId }),
    rows: (snap) => ({
      locked: [],
      // A rhythm's ticks are its own rows (the rhythm source), so they aren't listed twice.
      rows: Object.values(snap.entries).filter((e) => snap.collections[e.trackerId] && !snap.collections[e.trackerId].streams?.length).map((e) => {
        const tracker = snap.collections[e.trackerId];
        return row('trackerEntry', e.id, {
          title: tracker.name, when: e.date, time: null, status: 'done',
          endeavourId: tracker.collectionId, context: e.notes,
        });
      }),
    }),
  },
  {
    // Questions in notes (`\question`): open until answered; dropped ones are left out like archived
    // items. Dated by their follow-up, if they have one. Their Endeavour is their note's.
    key: 'question', icon: QUESTION_ICON, label: LABELS.overview.sources.question,
    tagged: (r, snap) => noteTagged(r.id.split(':')[0], snap),
    rows: (snap) => {
      const readable = Object.values(snap.notes).filter((n) => !snap.lockedNoteIds.has(n.id));
      return {
        locked: [],
        rows: collectQuestions(readable).map((q) => {
          const note = snap.notes[q.noteId];
          return row('question', `${q.noteId}:${q.qid}`, {
            title: q.text || LABELS.noteBlocks.question.label,
            when: q.followUp, time: null,
            status: q.status === 'answered' ? 'done' : q.status === 'dropped' ? 'archived' : 'open',
            endeavourId: note ? getNoteEffectiveCollectionId(note, snap.noteTags) : null,
            context: q.noteTitle || '(Untitled)',
            plan: plan(q.followUp ? 'point' : 'tray', {}),
          });
        }),
      };
    },
  },
  {
    // What's waiting in every inbox (the `\inbox` note block): an item's first line, the day it
    // arrived, its status (Built counts as done), the note and inbox it's in. Its Endeavour is its note's.
    key: 'inboxItem', icon: INBOX_ICON, label: LABELS.overview.sources.inboxItem,
    tagged: (r, snap) => noteTagged(r.id.split(':')[0], snap),
    rows: (snap) => {
      const readable = Object.values(snap.notes).filter((n) => !snap.lockedNoteIds.has(n.id));
      return {
        locked: [],
        rows: collectInboxes(readable).flatMap((inbox) => {
          const note = snap.notes[inbox.noteId];
          const endeavourId = note ? getNoteEffectiveCollectionId(note, snap.noteTags) : null;
          const where = `${inbox.noteTitle || '(Untitled)'} › ${inbox.title || LABELS.noteBlocks.inbox.defaultTitle}`;
          return inbox.items.filter((it) => it.itemId).map((it) => row('inboxItem', `${inbox.noteId}:${it.itemId}`, {
            title: it.text || LABELS.noteBlocks.inbox.itemPlaceholder,
            when: it.sentAt ? localDay(it.sentAt) : null,
            time: null,
            status: it.status === 'built' ? 'done' : 'open',
            endeavourId,
            context: `${where} · ${LABELS.noteBlocks.inbox.statuses[it.status]}`,
            // The day it arrived isn't a date it's due by: the No date tray.
            plan: plan('tray', {}),
          }));
        }),
      };
    },
  },
  {
    // Passages and blocks on the review list (Review later): due on their next review day. Their
    // Endeavour is their note's. Rescheduling is the Review view's spaced repetition, so not draggable.
    key: 'review', icon: REVIEW_ICON, label: LABELS.overview.sources.review,
    tagged: (r, snap) => noteTagged(r.id.split(':')[0], snap),
    rows: (snap) => {
      const readable = Object.values(snap.notes).filter((n) => !snap.lockedNoteIds.has(n.id));
      return {
        locked: [],
        rows: readable.flatMap((n) => {
          const endeavourId = getNoteEffectiveCollectionId(n, snap.noteTags);
          const tabs: [string | null, string][] = [[null, n.content], ...n.tabs.map((t): [string, string] => [t.id, t.content])];
          return tabs.flatMap(([tabId, json]) => collectReviewPassages(json).map((p) => row('review', `${n.id}:${tabId ?? 'main'}:${p.passageId}`, {
            title: p.text, when: p.reviewDue, time: null,
            status: 'open',
            endeavourId, context: n.title || '(Untitled)',
            plan: plan('point', { important: p.level >= 3 }),
          })));
        }),
      };
    },
  },
  {
    // A rhythm's occurrences (docs/features/endeavours.md phase 4): two weeks back (what's behind)
    // and the week ahead. Only rhythms given streams: a routine never given any shows nowhere new.
    // Filed under the rhythm, which is part of its Endeavour, so an Endeavour's home rolls them up.
    key: 'rhythm', icon: RHYTHM_ICON, label: LABELS.overview.sources.rhythm,
    tagged: (r, snap) => ({ tagIds: snap.collections[r.endeavourId ?? '']?.tagIds, collectionId: r.endeavourId }),
    rows: (snap, today) => {
      const ticks = tickIndex(snap.entries, snap.collections);
      const from = addDaysToIso(today, -BEHIND_DAYS);
      const to = addDaysToIso(today, 7);
      return {
        locked: [],
        rows: Object.values(snap.collections)
          .filter((c) => isRhythm(c) && !c.archivedAt && !!c.streams?.length)
          .flatMap((c) => rhythmOccurrences(c, snap.schedules ?? {}, ticks, from, to, today, snap.events))
          .map((o) => row('rhythm', o.key, {
            title: o.stream.label, when: o.date, time: o.time,
            status: isDealtWith(o.state) ? 'done' : 'open',
            endeavourId: o.rhythm.id, context: o.rhythm.name,
            plan: plan('point', {}),
          })),
      };
    },
  },
];

export const SOURCE_BY_KEY = Object.fromEntries(OVERVIEW_SOURCES.map((s) => [s.key, s])) as Record<OverviewSourceKey, OverviewSourceDef>;

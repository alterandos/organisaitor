import { LABELS } from '@/config/labels';
import { addDaysToIso } from '@/utils/date';
import { expandRepeat } from '@/utils/recurrence';
import { getNoteEffectiveCollectionId } from '@/utils/notes';
import type {
  CalendarDeadline, CalendarEvent, CalendarReminder, Collection, RepeatConfig, Task, TrackerEntry,
} from '@/types';
import type { List, ListItem } from '@/types/lists';
import type { Note, NoteTag } from '@/types/notes';
import type { OverviewRow, OverviewSourceKey, OverviewStatus } from '@/types/overview';

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
}

const row = (source: OverviewSourceKey, id: string, r: Omit<OverviewRow, 'key' | 'source' | 'id'>): OverviewRow =>
  ({ key: `${source}:${id}`, source, id, ...r });

// A calendar item's main date and whether it's still ahead: the next occurrence for a repeating
// one (within two years), else its own date — "past" once its last day has gone by.
function calendarWhen(date: string, endDate: string | null, repeat: RepeatConfig | null, today: string): { when: string; status: OverviewStatus } {
  if (repeat) {
    const next = expandRepeat(date, repeat, today, addDaysToIso(today, 730))[0];
    return next ? { when: next, status: 'open' } : { when: date, status: 'past' };
  }
  return { when: date, status: (endDate ?? date) < today ? 'past' : 'open' };
}

export const OVERVIEW_SOURCES: OverviewSourceDef[] = [
  {
    key: 'task', icon: '✔', label: LABELS.overview.sources.task,
    rows: (snap) => ({
      locked: [],
      rows: Object.values(snap.tasks).map((t) => row('task', t.id, {
        title:       t.title,
        when:        t.deadline ?? t.scheduledAt,
        time:        t.deadline ? t.deadlineTime : t.scheduledTime,
        status:      t.archived ? 'archived' : t.completed ? 'done' : 'open',
        endeavourId: t.collectionId,
        context:     t.parentId ? snap.tasks[t.parentId]?.title ?? null : null,
      })),
    }),
  },
  {
    // A task's own scheduled/deadline shadows are left out — the task row already stands for them.
    key: 'event', icon: '📅', label: LABELS.overview.sources.event,
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.events).filter((e) => e.eventType !== 'task').map((e) => {
        const w = calendarWhen(e.date, e.endDate, e.repeat, today);
        return row('event', e.id, {
          title: e.title, when: w.when, time: e.startTime,
          status: e.archivedAt ? 'archived' : w.status,
          endeavourId: e.collectionId, context: e.location,
        });
      }),
    }),
  },
  {
    key: 'reminder', icon: '🔔', label: LABELS.overview.sources.reminder,
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.reminders).filter((r) => r.reminderType !== 'task').map((r) => {
        const w = calendarWhen(r.date, null, r.repeat, today);
        return row('reminder', r.id, {
          title: r.title, when: w.when, time: r.time,
          status: r.archivedAt ? 'archived' : w.status,
          endeavourId: r.collectionId, context: null,
        });
      }),
    }),
  },
  {
    key: 'deadline', icon: '⏰', label: LABELS.overview.sources.deadline,
    rows: (snap, today) => ({
      locked: [],
      rows: Object.values(snap.deadlines).filter((d) => d.deadlineType !== 'task').map((d) => {
        const w = calendarWhen(d.date, null, d.repeat, today);
        return row('deadline', d.id, {
          title: d.title, when: w.when, time: d.time,
          status: d.archivedAt ? 'archived' : w.status,
          endeavourId: d.collectionId, context: null,
        });
      }),
    }),
  },
  {
    // Reference material rather than something to finish: undated, and "open" while it exists.
    key: 'note', icon: '📝', label: LABELS.overview.sources.note,
    rows: (snap) => {
      const notes = Object.values(snap.notes);
      return {
        locked: notes.filter((n) => snap.lockedNoteIds.has(n.id)).map((n) => getNoteEffectiveCollectionId(n, snap.noteTags)),
        rows: notes.filter((n) => !snap.lockedNoteIds.has(n.id)).map((n) => row('note', n.id, {
          title: n.title || '(Untitled)', when: null, time: null,
          status: n.archivedAt ? 'archived' : 'open',
          endeavourId: getNoteEffectiveCollectionId(n, snap.noteTags), context: null,
        })),
      };
    },
  },
  {
    key: 'list', icon: '📃', label: LABELS.overview.sources.list,
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
    key: 'listItem', icon: '🔹', label: LABELS.overview.sources.listItem,
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
          });
        }),
      };
    },
  },
  {
    key: 'trackerEntry', icon: '📊', label: LABELS.overview.sources.trackerEntry,
    rows: (snap) => ({
      locked: [],
      rows: Object.values(snap.entries).filter((e) => snap.collections[e.trackerId]).map((e) => {
        const tracker = snap.collections[e.trackerId];
        return row('trackerEntry', e.id, {
          title: tracker.name, when: e.date, time: null, status: 'done',
          endeavourId: tracker.collectionId, context: e.notes,
        });
      }),
    }),
  },
];

export const SOURCE_BY_KEY = Object.fromEntries(OVERVIEW_SOURCES.map((s) => [s.key, s])) as Record<OverviewSourceKey, OverviewSourceDef>;

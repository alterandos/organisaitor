import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useTrackerStore } from '@/store/trackerStore';
import { isNoteLocked, noteView, useSecretsVersion } from '@/services/noteSecrets';
import { isListLocked, listView, itemView } from '@/services/listSecrets';
import { openItem, type OpenWhere } from '@/services/openItem';
import { addCrossAppRef, unlinkOneCrossAppRef } from '@/services/crossAppLinkCleanup';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import { getNoteBreadcrumb } from '@/utils/notes';
import { tabNameOf } from '@/utils/noteTabs';
import { addDaysToIso, formatDate } from '@/utils/date';
import { expandRepeat } from '@/utils/recurrence';
import type { RankField } from '@/utils/suggestRank';
import type { CalendarDeadline, CalendarEvent, CalendarReminder, Collection, CrossAppRef, CrossAppRefType, ItemLinkTargetType, RepeatConfig, Task, TrackerEntry } from '@/types';
import type { Note, NoteTag } from '@/types/notes';
import type { List, ListItem } from '@/types/lists';

// THE registry of things a link can point at (adopted 2026-11-10, docs/agent-tasks/
// 08-linking-consolidation.md Task 1), modelled on ARTIFACT_TYPES and FILED_KINDS. One entry per
// kind says what it is (icon, name), whether one still exists or is locked and what it's called
// (`resolve`), how it's opened (`open`, through services/openItem.ts), what a picker offers and
// how it ranks them (`picker`), and how a link to it is stored (`storage`). Every picker
// (components/ItemPickerModal/LinkPickerModal), the Linked items field (components/
// LinkedItemsField) and "what links here" (services/linksTo.ts) read kinds from here, so a new kind
// (a tracker entry, next) is one entry plus its labels.
//
// Which storage (the rule, CLAUDE.md "Linking"): a link that does something (blocks completion,
// sets or follows dates) is a task link (Task.itemLinks); a plain "see also" is a cross-app
// reference (crossAppRefs).

// Everything a lookup reads, raw from the stores (resolve reads encrypted notes and lists through
// their views). `linkSnapshot()` reads it once; `useLinkSnapshot()` re-renders on any change.
export interface LinkSnapshot {
  tasks:          Record<string, Task>;
  collections:    Record<string, Collection>;
  events:         Record<string, CalendarEvent>;
  reminders:      Record<string, CalendarReminder>;
  deadlines:      Record<string, CalendarDeadline>;
  notes:          Record<string, Note>;
  noteTags:       Record<string, NoteTag>;
  lists:          Record<string, List>;
  listItems:      Record<string, ListItem>;
  trackerEntries: Record<string, TrackerEntry>;
}

export function linkSnapshot(): LinkSnapshot {
  const t = useTaskStore.getState();
  const c = useCalendarStore.getState();
  const n = useNoteStore.getState();
  const l = useListStore.getState();
  return {
    tasks: t.tasks, collections: t.collections, events: c.events, reminders: c.reminders, deadlines: c.deadlines,
    notes: n.notes, noteTags: n.noteTags, lists: l.lists, listItems: l.listItems, trackerEntries: useTrackerStore.getState().entries,
  };
}

export function useLinkSnapshot(): LinkSnapshot & { version: number } {
  const tasks = useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  const events = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const notes = useNoteStore((s) => s.notes);
  const noteTags = useNoteStore((s) => s.noteTags);
  const lists = useListStore((s) => s.lists);
  const listItems = useListStore((s) => s.listItems);
  const trackerEntries = useTrackerStore((s) => s.entries);
  // An encrypted note or list unlocking changes what resolve returns, not the stores.
  const version = useSecretsVersion((s) => s.version);
  return useMemo(() => ({ tasks, collections, events, reminders, deadlines, notes, noteTags, lists, listItems, trackerEntries, version }),
    [tasks, collections, events, reminders, deadlines, notes, noteTags, lists, listItems, trackerEntries, version]);
}

// What a link shows for its item. null from resolve: the item is gone (deleted, perhaps in the
// Recycling Bin), and the link is hidden until it's restored.
export interface ResolvedLink {
  title:   string;
  // A second line: where it lives (a note's notebook, a task's Endeavour) or when it is.
  context: string | null;
  // An encrypted note or list while locked: shown as locked, never its text.
  locked:  boolean;
  done:    boolean;
  // The item's own icon (a list's), shown instead of the kind's.
  icon?:   string | null;
}

// One thing a picker can offer.
export interface PickerCandidate {
  type:   CrossAppRefType;
  id:     string;
  title:  string;
  icon?:  string | null;
  meta:   string;
  fields: RankField[];
  // Higher first wherever the order isn't decided by the search (recency, soonest).
  order:  number;
  // A repeating item: its dates can be chosen one by one (the picker's dates step).
  series?: { base: string; repeat: RepeatConfig };
  locked?: boolean;
}

export interface PickerLabels { title: string; search: string; empty: string; footer: string }

export interface LinkTargetDef {
  type:    CrossAppRefType;
  icon:    string;
  label:   string;
  // 'reference': CrossAppRef on the item linking (tasks, calendar items, lists). 'taskLink': an
  // ItemLink a task owns (calendar items, other tasks). A kind can be both: a calendar item is
  // linked from a task as a task link (it sets the task's dates) and from nowhere else yet.
  storage: ('reference' | 'taskLink')[];
  resolve: (snap: LinkSnapshot, id: string, tabId?: string) => ResolvedLink | null;
  open:    (id: string, where?: OpenWhere) => boolean;
  // What a picker offers. Absent: picked another way (a note, through NotePickerModal, the note
  // kind's own picker with its tab-aware ranking) or not linkable yet.
  picker?: { labels: PickerLabels; candidates: (snap: LinkSnapshot, exclude: ReadonlySet<string>, today: string) => PickerCandidate[] };
}

const P = LABELS.linkedItems;
const name = (c: Record<string, Collection>, id: string | null | undefined) => (id ? c[id]?.name ?? '' : '');

// A repeating item's next date from today (within a year and a bit), else its own date.
function nextDate(date: string, repeat: RepeatConfig | null, today: string): string {
  if (!repeat) return date;
  return expandRepeat(date, repeat, today, addDaysToIso(today, 400))[0] ?? date;
}
// Coming up first, soonest first; then the past, latest first.
const soonest = (date: string, today: string) => { const t = Date.parse(`${date}T00:00:00Z`); return date >= today ? 2e13 - t : t; };

type CalendarItem = CalendarEvent | CalendarReminder | CalendarDeadline;
const isShadow = (i: CalendarItem) => ('eventType' in i && i.eventType === 'task') || ('reminderType' in i && i.reminderType === 'task') || ('deadlineType' in i && i.deadlineType === 'task');

const calendarLabels: PickerLabels = {
  title: LABELS.taskLinks.calendarPickerTitle, search: LABELS.taskLinks.calendarPickerSearch,
  empty: LABELS.taskLinks.calendarPickerEmpty, footer: LABELS.taskLinks.calendarPickerFooter,
};

function calendarKind(type: 'event' | 'reminder' | 'deadline', of: (s: LinkSnapshot) => Record<string, CalendarItem>): LinkTargetDef {
  return {
    type, icon: ITEM_TYPE_ICON[type], label: P.kinds[type], storage: ['reference', 'taskLink'],
    resolve: (snap, id) => {
      const item = of(snap)[id];
      if (!item) return null;
      const done = type !== 'event' && !item.repeat && (item as CalendarReminder).doneDates?.includes(item.date);
      return { title: item.title, context: formatDate(item.date), locked: false, done: !!done };
    },
    open: (id, where) => openItem(type, id, where),
    picker: {
      labels: calendarLabels,
      // A task's own calendar entries and archived items aren't offered.
      candidates: (snap, exclude, today) => Object.values(of(snap)).filter((i) => !i.archivedAt && !isShadow(i) && !exclude.has(i.id)).map((i) => {
        const date = nextDate(i.date, i.repeat, today);
        const endeavour = name(snap.collections, i.collectionId);
        return {
          type, id: i.id, title: i.title,
          meta: [formatDate(date), i.repeat ? LABELS.taskLinks.calendarRepeats : null, endeavour || null].filter(Boolean).join(' · '),
          fields: [{ text: i.title, weight: 3 }, { text: endeavour, weight: 2 }, { text: i.notes ?? '', weight: 1, counted: true }],
          order: soonest(date, today),
          ...(i.repeat ? { series: { base: i.date, repeat: i.repeat } } : {}),
        };
      }),
    },
  };
}

export const LINK_TARGETS: { [K in CrossAppRefType]: LinkTargetDef } = {
  note: {
    type: 'note', icon: ITEM_TYPE_ICON.note, label: P.kinds.note, storage: ['reference'],
    resolve: (snap, id, tabId) => {
      const raw = snap.notes[id];
      if (!raw) return null;
      const locked = raw.isEncrypted && isNoteLocked(raw);
      const n = noteView(raw);
      const path = getNoteBreadcrumb(n, snap.noteTags);
      const tab = locked ? null : tabNameOf(n, tabId);
      return {
        title: locked ? P.lockedNote : n.title || P.untitled,
        context: [tab ? `› ${tab}` : null, path ? path.split(' > ').pop() : null].filter(Boolean).join(' · ') || null,
        locked, done: false,
      };
    },
    open: (id, where) => openItem('note', id, where),
  },
  list: {
    type: 'list', icon: ITEM_TYPE_ICON.list, label: P.kinds.list, storage: ['reference'],
    resolve: (snap, id) => {
      const raw = snap.lists[id];
      if (!raw) return null;
      const locked = raw.isEncrypted && isListLocked(raw);
      const l = listView(raw);
      return { title: locked ? P.lockedList : l.name, context: LABELS.listKind[l.kind].one, locked, done: false, icon: locked ? null : l.icon };
    },
    open: (id) => openItem('list', id),
    picker: {
      labels: { title: LABELS.listLinks.pickerTitle, search: LABELS.listLinks.pickerSearch, empty: LABELS.listLinks.pickerEmpty, footer: P.pickerFooter },
      // Searched by name, description and item titles; checklists first (the ones a task can tick
      // off), most recent first.
      candidates: (snap, exclude) => {
        const items: Record<string, { titles: string[]; total: number; done: number }> = {};
        for (const i of Object.values(snap.listItems)) {
          const c = (items[i.listId] ??= { titles: [], total: 0, done: 0 });
          c.titles.push(itemView(i).title);
          c.total++;
          if (i.status === 'done') c.done++;
        }
        return Object.values(snap.lists).filter((raw) => !exclude.has(raw.id)).map((raw) => {
          const l = listView(raw);
          const c = items[l.id] ?? { titles: [], total: 0, done: 0 };
          return {
            type: 'list' as const, id: l.id, title: l.name, icon: l.icon, locked: l.isEncrypted && isListLocked(raw),
            meta: l.kind === 'checklist' ? P.checklistMeta(LABELS.listKind.checklist.one, c.done, c.total) : P.listMeta(LABELS.listKind[l.kind].one, c.total),
            fields: [{ text: l.name, weight: 3 }, { text: l.description ?? '', weight: 1 }, { text: c.titles.join(' | '), weight: 1, counted: true }],
            order: new Date(l.updatedAt).getTime() + (l.kind === 'checklist' ? 1e13 : 0),
          };
        });
      },
    },
  },
  task: {
    type: 'task', icon: ITEM_TYPE_ICON.task, label: P.kinds.task, storage: ['taskLink'],
    resolve: (snap, id) => {
      const t = snap.tasks[id];
      if (!t) return null;
      return { title: t.title, context: name(snap.collections, t.collectionId) || null, locked: false, done: t.completed || t.archived };
    },
    open: (id) => openItem('task', id),
    picker: {
      labels: { title: LABELS.taskLinks.pickerTitle, search: LABELS.taskLinks.pickerSearch, empty: LABELS.taskLinks.pickerEmpty, footer: P.pickerFooter },
      // Archived tasks aren't offered; done ones sort after open ones wherever recency decides.
      candidates: (snap, exclude) => Object.values(snap.tasks).filter((t) => !t.archived && !exclude.has(t.id)).map((t) => {
        const endeavour = name(snap.collections, t.collectionId);
        return {
          type: 'task' as const, id: t.id, title: t.title,
          meta: [t.completed ? P.done : null, endeavour || null, t.deadline ? P.due(formatDate(t.deadline)) : null].filter(Boolean).join(' · '),
          fields: [
            { text: t.title, weight: 3 }, { text: endeavour, weight: 2 },
            { text: t.parentId ? snap.tasks[t.parentId]?.title ?? '' : '', weight: 1 }, { text: t.notes ?? '', weight: 1, counted: true },
          ],
          order: new Date(t.updatedAt).getTime() - (t.completed ? 1e13 : 0),
        };
      }),
    },
  },
  event:    calendarKind('event', (s) => s.events),
  reminder: calendarKind('reminder', (s) => s.reminders),
  deadline: calendarKind('deadline', (s) => s.deadlines),
  // Not linkable yet (BACKLOG.md "Notes — open items"): resolved and opened, no picker.
  listItem: {
    type: 'listItem', icon: ITEM_TYPE_ICON.listItem, label: P.kinds.listItem, storage: ['reference'],
    resolve: (snap, id) => {
      const raw = snap.listItems[id];
      if (!raw) return null;
      const i = itemView(raw);
      const list = snap.lists[i.listId];
      return { title: i.title, context: list ? listView(list).name : null, locked: false, done: i.status === 'done' };
    },
    open: (id) => openItem('listItem', id),
  },
  trackerEntry: {
    type: 'trackerEntry', icon: ITEM_TYPE_ICON.trackerEntry, label: P.kinds.trackerEntry, storage: ['reference'],
    resolve: (snap, id) => {
      const e = snap.trackerEntries[id];
      if (!e) return null;
      return { title: name(snap.collections, e.trackerId) || P.kinds.trackerEntry, context: formatDate(e.date), locked: false, done: false };
    },
    open: (id) => openItem('trackerEntry', id),
  },
};

// Kinds a task link can point at (Task.itemLinks' targetType): every one has an entry above.
export const TASK_LINK_TARGETS: ItemLinkTargetType[] = ['task', 'event', 'reminder', 'deadline'];

// The items that hold cross-app references, and so can link to something "see also".
export type LinkOwnerType = 'task' | 'event' | 'reminder' | 'deadline' | 'list';
export interface LinkOwner { type: LinkOwnerType; id: string }

const sameRef = (a: CrossAppRef, b: CrossAppRef) => a.type === b.type && a.id === b.id && (a.tabId ?? null) === (b.tabId ?? null);

// Adds or removes references on an existing item: every Linked items field goes through here, so
// unlinking a note also takes the linked text out of it (crossAppLinkCleanup.unlinkOneCrossAppRef).
export function addReference(owner: LinkOwner, ref: CrossAppRef): void {
  addCrossAppRef(owner.type, owner.id, ref);
}
export function removeReference(owner: LinkOwner, ref: CrossAppRef): void {
  unlinkOneCrossAppRef(owner.type, owner.id, ref);
}
export const hasRef = (refs: readonly CrossAppRef[], ref: CrossAppRef) => refs.some((r) => sameRef(r, ref));

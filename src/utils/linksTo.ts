import type { CalendarDeadline, CalendarEvent, CalendarReminder, CrossAppRef, ItemLinkKind, Task } from '@/types';
import type { List } from '@/types/lists';

// What links to an item, read from both ways a link is stored (adopted 2026-11-10,
// docs/agent-tasks/08-linking-consolidation.md Task 5): cross-app references (crossAppRefs on
// tasks, calendar items and lists) and task links (Task.itemLinks, with how each relates and, for
// one date of a series, which date). Derived on each read, never stored, so it can't disagree with
// the items holding the links. One entry per link: a task linked to three dates of a series is
// three. The note's "Linked from" bar, a calendar item's Tasks, a list's "Linked from" and a task's
// incoming task links all read it (services/linksTo.ts gives it the stores).

export type LinkSourceType = 'task' | 'event' | 'reminder' | 'deadline' | 'list';

export interface IncomingLink {
  type:        LinkSourceType;
  id:          string;
  title:       string;
  // A completed task, or a one-off Reminder or Deadline marked done.
  done:        boolean;
  // Archived (tasks and calendar items): most places leave these out.
  archived:    boolean;
  via:         'reference' | 'taskLink';
  // A task link's kind, reason, the date of a series it names and the task rule that made it.
  kind?:       ItemLinkKind;
  reason?:     string | null;
  occurrence?: string;
  ruleId?:     string;
  // A reference to one tab of a note.
  tabId?:      string;
  task?:       Task;
}

export interface LinksToSnapshot {
  tasks:     Record<string, Task>;
  events:    Record<string, CalendarEvent>;
  reminders: Record<string, CalendarReminder>;
  deadlines: Record<string, CalendarDeadline>;
  // Views (listView), so an encrypted list shows its name or the locked placeholder.
  lists:     Record<string, List>;
}

const doneOn = (i: CalendarReminder | CalendarDeadline) => !i.repeat && (i.doneDates ?? []).includes(i.date);

export function linksToIn(snap: LinksToSnapshot, type: string, id: string): IncomingLink[] {
  const out: IncomingLink[] = [];
  const refs = (refs: CrossAppRef[] | undefined, base: Omit<IncomingLink, 'via' | 'tabId'>) => {
    for (const r of refs ?? []) if (r.type === type && r.id === id) out.push({ ...base, via: 'reference', ...(r.tabId ? { tabId: r.tabId } : {}) });
  };
  for (const t of Object.values(snap.tasks)) {
    const base = { type: 'task' as const, id: t.id, title: t.title, done: t.completed, archived: t.archived, task: t };
    refs(t.crossAppRefs, base);
    for (const l of t.itemLinks ?? []) {
      if ((l.targetType ?? 'task') !== type || l.targetId !== id || t.id === id) continue;
      out.push({ ...base, via: 'taskLink', kind: l.kind, reason: l.reason, ...(l.occurrence ? { occurrence: l.occurrence } : {}), ...(l.ruleId ? { ruleId: l.ruleId } : {}) });
    }
  }
  for (const e of Object.values(snap.events)) refs(e.crossAppRefs, { type: 'event', id: e.id, title: e.title, done: false, archived: !!e.archivedAt });
  for (const r of Object.values(snap.reminders)) refs(r.crossAppRefs, { type: 'reminder', id: r.id, title: r.title, done: doneOn(r), archived: !!r.archivedAt });
  for (const d of Object.values(snap.deadlines)) refs(d.crossAppRefs, { type: 'deadline', id: d.id, title: d.title, done: doneOn(d), archived: !!d.archivedAt });
  for (const l of Object.values(snap.lists)) refs(l.crossAppRefs, { type: 'list', id: l.id, title: l.name, done: false, archived: false });
  return out;
}

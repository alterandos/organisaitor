import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useFitnessStore } from '@/store/fitnessStore';
import type { CollectionId, PurposeId, TagId } from '@/types';
import { childrenOf } from '@/utils/endeavourGraph';

// Whether an Endeavour, a Purpose or a tag is used by anything, across the apps. Deleting one that
// isn't doesn't ask (the user's rule, 2026-10-22: anything deleted asks first, unless it's empty;
// for a label or a container, "empty" is "used by nothing", BACKLOG.md's retrofit entry). Reads
// only; a deletion's own cleanup stays in the stores and services/crossAppLinkCleanup.ts.

export function endeavourInUse(id: CollectionId): boolean {
  const has = <T extends { collectionId?: CollectionId | null }>(rec: Record<string, T>) => Object.values(rec).some((x) => x.collectionId === id);
  const { tasks, collections } = useTaskStore.getState();
  const { events, reminders, deadlines } = useCalendarStore.getState();
  const { notes, noteTags } = useNoteStore.getState();
  // An Endeavour other Endeavours are part of (a link, or the old "filed under" field) is in use.
  return has(tasks) || childrenOf(id, collections).length > 0
    || has(events) || has(reminders) || has(deadlines)
    || has(notes) || has(noteTags) || has(useListStore.getState().lists);
}

export function purposeInUse(id: PurposeId): boolean {
  const { tasks, collections } = useTaskStore.getState();
  return Object.values(tasks).some((t) => t.purposeIds.includes(id))
    || Object.values(collections).some((c) => c.purposeIds.includes(id))
    || Object.values(useFitnessStore.getState().activities).some((a) => a.purposeIds.includes(id));
}

// What a tag is on is worked out here, never stored on the tag (2026-11-06).
export function tagUses(id: TagId): number {
  const count = <T,>(rec: Record<string, T>, ids: (x: T) => readonly string[] | undefined) => Object.values(rec).filter((x) => ids(x)?.includes(id)).length;
  const { tasks, collections } = useTaskStore.getState();
  const { events, reminders, deadlines } = useCalendarStore.getState();
  const { notes, noteTags } = useNoteStore.getState();
  return count(tasks, (t) => t.tagIds) + count(collections, (c) => c.tagIds)
    + count(events, (e) => e.tagIds) + count(reminders, (r) => r.tagIds) + count(deadlines, (d) => d.tagIds)
    + count(notes, (n) => n.suiteTagIds) + count(noteTags, (t) => t.suiteTagIds) + count(useListStore.getState().lists, (l) => l.tagIds);
}

export function tagInUse(id: TagId): boolean {
  return tagUses(id) > 0;
}

import { useTaskStore } from '@/store/taskStore';
import { newTagId } from '@/utils/id';
import type { Tag, TagId } from '@/types';

// Choosing tags (components/TagField), for every form in the suite. A tag typed that doesn't exist
// yet is a draft until the form is saved: `commitTags` makes the drafts it's given, so a form closed
// without saving makes nothing (the user, 2026-11-06: nothing made silently). A pane that saves as
// it goes commits at once.

const drafts = new Map<TagId, string>();

export function findTag(name: string): Tag | undefined {
  const key = name.trim().toLowerCase();
  return Object.values(useTaskStore.getState().tags).find((t) => t.name.trim().toLowerCase() === key);
}

// The tag of this name: an existing one (archived ones too), else a draft.
export function tagByName(name: string): TagId {
  const existing = findTag(name);
  if (existing) return existing.id;
  for (const [id, n] of drafts) if (n.toLowerCase() === name.trim().toLowerCase()) return id;
  const id = newTagId();
  drafts.set(id, name.trim());
  return id;
}

export const isDraftTag = (id: string) => drafts.has(id as TagId) && !useTaskStore.getState().tags[id as TagId];

export function tagLabel(id: string): string {
  return useTaskStore.getState().tags[id as TagId]?.name ?? drafts.get(id as TagId) ?? '';
}

// Makes the drafts among `ids`; returns the ids that are real tags now (one deleted meanwhile drops).
export function commitTags(ids: readonly string[]): TagId[] {
  const store = useTaskStore.getState();
  const out: TagId[] = [];
  for (const raw of new Set(ids)) {
    const id = raw as TagId;
    if (!store.tags[id] && drafts.has(id)) store.addTag({ id, name: drafts.get(id)! });
    drafts.delete(id);
    if (useTaskStore.getState().tags[id]) out.push(id);
  }
  return out;
}

// The tags named, made where they don't exist (a template's tags, on Create).
export function tagsByName(names: readonly string[]): TagId[] {
  return commitTags(names.map((n) => n.trim()).filter(Boolean).map(tagByName));
}

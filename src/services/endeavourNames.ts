import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { listView } from '@/services/listSecrets';

// Something made from an Endeavour's home starts with the Endeavour's name (the user, 2026-11-07: a
// notebook for "Biology" is "Biology"), numbered when that name is already taken by one of its kind
// ("Biology 2"). Only a starting name: the pane it opens in lets the person change it. Tasks,
// calendar items, trackers, routines and goals are specific things, so they start blank.

export type NamedKind = 'notebook' | 'list' | 'schedule';

function takenNames(kind: NamedKind): Set<string> {
  const names = kind === 'notebook'
    ? Object.values(useNoteStore.getState().noteTags).filter((t) => t.kind === 'area').map((t) => t.name)
    : kind === 'list'
      ? Object.values(useListStore.getState().lists).map((l) => listView(l).name)
      : Object.values(useScheduleStore.getState().schedules).map((s) => s.name);
  return new Set(names.map((n) => n.trim().toLowerCase()));
}

// `base`, or `base 2`, `base 3`… whichever is free among things of this kind.
export function uniqueName(kind: NamedKind, base: string): string {
  const taken = takenNames(kind);
  const name = base.trim();
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
}

export function nameFromEndeavour(kind: NamedKind, endeavourId: string): string {
  const c = useTaskStore.getState().collections[endeavourId as never];
  return c ? uniqueName(kind, c.name) : '';
}

import type { Collection, ScheduleTemplate } from '@/types';
import { parentsOf } from '@/utils/endeavourGraph';

// The calendar's Schedules as a tree that follows the Endeavours (the user, 2026-11-06: a semester's
// subjects each have a timetable, and a flat list of them is poor), so a parent's switch turns all
// of its schedules on or off. Nothing is stored: a parent "schedule" is only this grouping. Each
// schedule shows once, under its Endeavour's first chain of parents; one filed under nothing is at
// the top level. Pure, so the side pane and tests share it.

type Collections = Record<string, Collection>;

export interface ScheduleGroup {
  endeavourId: string;
  name:        string;
  groups:      ScheduleGroup[];
  schedules:   ScheduleTemplate[];
}

export interface ScheduleTree { groups: ScheduleGroup[]; loose: ScheduleTemplate[] }

// The chain from the top down to `id`, following each Endeavour's first parent (once each).
function chain(id: string, all: Collections): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let cur: string | undefined = id; cur && all[cur] && !seen.has(cur); cur = parentsOf(all[cur], all)[0]) {
    seen.add(cur);
    out.unshift(cur);
  }
  return out;
}

export function scheduleTree(schedules: readonly ScheduleTemplate[], all: Collections): ScheduleTree {
  const roots: ScheduleGroup[] = [];
  const loose: ScheduleTemplate[] = [];
  const index = new Map<string, ScheduleGroup>();
  const groupFor = (path: string[]): ScheduleGroup => {
    let siblings = roots;
    let g: ScheduleGroup | undefined;
    for (const id of path) {
      g = index.get(id);
      if (!g) {
        g = { endeavourId: id, name: all[id].name, groups: [], schedules: [] };
        index.set(id, g);
        siblings.push(g);
      }
      siblings = g.groups;
    }
    return g!;
  };
  for (const s of schedules) {
    if (!s.collectionId || !all[s.collectionId]) { loose.push(s); continue; }
    groupFor(chain(s.collectionId, all)).schedules.push(s);
  }
  const sort = (gs: ScheduleGroup[]) => {
    gs.sort((a, b) => a.name.localeCompare(b.name));
    for (const g of gs) { sort(g.groups); g.schedules.sort((a, b) => a.name.localeCompare(b.name)); }
  };
  sort(roots);
  return { groups: roots, loose: [...loose].sort((a, b) => a.name.localeCompare(b.name)) };
}

// Every schedule under a group, at any depth.
export function schedulesIn(g: ScheduleGroup): ScheduleTemplate[] {
  return [...g.schedules, ...g.groups.flatMap(schedulesIn)];
}

// A group's switch: on (all shown), off (none) or mixed.
export function groupState(g: ScheduleGroup): 'on' | 'off' | 'mixed' {
  const all = schedulesIn(g);
  const on = all.filter((s) => s.active).length;
  return on === 0 ? 'off' : on === all.length ? 'on' : 'mixed';
}

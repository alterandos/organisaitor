import type { Collection } from '@/types';
import { parentsOf } from '@/utils/endeavourGraph';

// An Endeavour's colour and icon (agreed with the user 2026-11-06): its own, else the nearest one of
// what it's part of, so a subject shows its semester's colour until it's given one. Every place that
// shows an Endeavour's colour or icon reads it here (pattern test "an Endeavour's colour comes from
// utils/endeavourLook.ts"), never `collection.color`, which is only its own.

type Collections = Record<string, Collection>;

export interface LookFrom<T> { value: T; from: string | null }   // `from`: the Endeavour it comes from (null: its own, or none)

function nearest<T>(id: string, all: Collections, pick: (c: Collection) => T | null | undefined): LookFrom<T | null> {
  const own = all[id] ? pick(all[id]) : null;
  if (own) return { value: own, from: null };
  const seen = new Set<string>([id]);
  let level: string[] = all[id] ? parentsOf(all[id], all) : [];
  while (level.length) {
    const next: string[] = [];
    for (const p of level) {
      if (seen.has(p) || !all[p]) continue;
      seen.add(p);
      const v = pick(all[p]);
      if (v) return { value: v, from: p };
      next.push(...parentsOf(all[p], all));
    }
    level = next;
  }
  return { value: null, from: null };
}

export function endeavourColorFrom(id: string, all: Collections): LookFrom<string | null> {
  return nearest(id, all, (c) => c.color);
}

export function endeavourColor(id: string | null | undefined, all: Collections): string | null {
  return id ? endeavourColorFrom(id, all).value : null;
}

export function endeavourIconFrom(id: string, all: Collections): LookFrom<string | null> {
  return nearest(id, all, (c) => c.icon);
}

export function endeavourIcon(id: string | null | undefined, all: Collections): string | null {
  return id ? endeavourIconFrom(id, all).value : null;
}

// What a new Endeavour part of `parents` would take (the creator, before it exists).
export function lookFromParents(parents: readonly string[], all: Collections): { color: LookFrom<string | null>; icon: LookFrom<string | null> } {
  const first = <T,>(get: (id: string) => LookFrom<T | null>): LookFrom<T | null> => {
    for (const p of parents) {
      const v = get(p);
      if (v.value) return { value: v.value, from: v.from ?? p };
    }
    return { value: null, from: null };
  };
  return { color: first((p) => endeavourColorFrom(p, all)), icon: first((p) => endeavourIconFrom(p, all)) };
}

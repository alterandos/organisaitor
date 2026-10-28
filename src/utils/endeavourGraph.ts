import type { Collection, CollectionId, EndeavourLinkKind } from '@/types';
import { ENDEAVOUR_LINK_KINDS } from '@/config/endeavourLinkKinds';

// The rules of the links between Endeavours (docs/features/endeavours.md), here and nowhere else:
// what an Endeavour is part of, everything part of it at any depth, and which links are refused.
// Pure, over the collections record, so filters, Overview and the agent all read the same answer.
//
// "Part of" comes from two places: `links` of a kind that rolls up (several parents allowed), and the
// older single "filed under" field (`collectionId`, trackers and routines), which is read as a link
// and left where it is. A link to an Endeavour that no longer exists is ignored, so restoring it from
// the Recycling Bin brings the link back.

type Collections = Record<string, Collection>;

export function parentsOf(c: Collection, all: Collections): CollectionId[] {
  const out = new Set<CollectionId>();
  for (const l of c.links ?? []) if (ENDEAVOUR_LINK_KINDS[l.kind]?.rollsUp && all[l.targetId]) out.add(l.targetId);
  if (c.collectionId && all[c.collectionId]) out.add(c.collectionId);
  out.delete(c.id);
  return [...out];
}

function childIndex(all: Collections): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const c of Object.values(all)) {
    for (const p of parentsOf(c, all)) {
      const list = index.get(p);
      if (list) list.push(c.id); else index.set(p, [c.id]);
    }
  }
  return index;
}

export function childrenOf(id: string, all: Collections): CollectionId[] {
  return (childIndex(all).get(id) ?? []) as CollectionId[];
}

// The Endeavour and everything part of it, at any depth: what "everything for X" means. Safe on a
// loop that slipped in some other way (another device, an import): each Endeavour is visited once.
export function endeavourSubtree(id: string, all: Collections): Set<string> {
  const index = childIndex(all);
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    for (const child of index.get(queue.shift()!) ?? []) {
      if (!seen.has(child)) { seen.add(child); queue.push(child); }
    }
  }
  return seen;
}

// Everything the Endeavour is part of, at any depth (not including itself).
export function endeavourAncestors(id: string, all: Collections): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const c = all[queue.shift()!];
    if (!c) continue;
    for (const p of parentsOf(c, all)) if (!seen.has(p) && p !== id) { seen.add(p); queue.push(p); }
  }
  return seen;
}

export type EndeavourLinkRefusal = 'self' | 'duplicate' | 'loop';

// Why a link can't be made, or null when it can. A link that rolls up may not make an Endeavour part
// of itself (the target is already inside the Endeavour linking to it).
export function canAddEndeavourLink(all: Collections, fromId: string, kind: EndeavourLinkKind, targetId: string): EndeavourLinkRefusal | null {
  if (fromId === targetId) return 'self';
  const def = ENDEAVOUR_LINK_KINDS[kind];
  const has = (a: string, b: string) => !!all[a]?.links?.some((l) => l.kind === kind && l.targetId === b);
  if (has(fromId, targetId) || (def.symmetric && has(targetId, fromId))) return 'duplicate';
  if (def.rollsUp && endeavourSubtree(fromId, all).has(targetId)) return 'loop';
  return null;
}

// Does an item filed under `id` belong to the chosen scope? null scope = no Endeavour chosen (all).
// Every Endeavour filter goes through this (pattern test), so choosing a parent includes its parts.
export function inEndeavourScope(scope: ReadonlySet<string> | null, id: string | null | undefined): boolean {
  return !scope || (!!id && scope.has(id));
}

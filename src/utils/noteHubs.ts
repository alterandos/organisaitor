import type { Note } from '@/types/notes';

// Idea hubs (the `\hub` note block, NoteEditor extensions/Hub.ts) read from stored note content,
// without an editor: for the Add to hub picker and the Hubs view. Pure.
//
// A hub gathers what bears on one bigger idea: passages of notes, Glossary terms and whole notes,
// each linked with how it relates (RELATIONS). Links point at things; nothing is moved or copied
// except a short preview of a passage.

// The order the hub's groups are shown in.
export const RELATIONS = ['causes', 'leadsTo', 'supports', 'contradicts', 'exampleOf', 'partOf', 'related'] as const;
export type HubRelation = typeof RELATIONS[number];

export const HUB_LINK_KINDS = ['passage', 'glossary', 'note'] as const;
export type HubLinkKind = typeof HUB_LINK_KINDS[number];

export interface HubLinkInfo {
  linkId:   string;
  relation: HubRelation;
  kind:     HubLinkKind;
  label:    string;
  noteId:   string | null;
  entryId:  string | null;
}

export interface HubInfo {
  hubId: string;
  title: string;
  take:  string;
  links: HubLinkInfo[];
}

export interface HubRef extends HubInfo {
  noteId:    string;
  noteTitle: string;
  tabId:     string | null;   // null = the main tab
}

interface JsonNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

const textOf = (n: JsonNode): string => n.text ?? (n.content ?? []).map(textOf).join('');
export const isRelation = (v: unknown): v is HubRelation => (RELATIONS as readonly unknown[]).includes(v);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

const cache = new Map<string, HubInfo[]>();
const CACHE_LIMIT = 400;

// Every hub in one stored content JSON string (cached by the string).
export function hubsInContent(json: string): HubInfo[] {
  if (!json || !json.includes('"hub"')) return [];
  const hit = cache.get(json);
  if (hit) return hit;
  const out: HubInfo[] = [];
  const walk = (node: JsonNode) => {
    if (node.type === 'hub') {
      const part = (type: string) => node.content?.find((c) => c.type === type);
      const title = part('hubTitle');
      const take = part('hubTake');
      out.push({
        hubId: String(node.attrs?.hubId ?? ''),
        title: title ? textOf(title).trim() : '',
        take:  take ? textOf(take).trim() : '',
        links: (node.content ?? []).filter((c) => c.type === 'hubLink').map((l) => {
          const a = l.attrs ?? {};
          return {
            linkId:   String(a.linkId ?? ''),
            relation: isRelation(a.relation) ? a.relation : 'related',
            kind:     (HUB_LINK_KINDS as readonly unknown[]).includes(a.kind) ? (a.kind as HubLinkKind) : 'passage',
            label:    String(a.label ?? ''),
            noteId:   str(a.noteId),
            entryId:  str(a.entryId),
          };
        }),
      });
      return;
    }
    node.content?.forEach(walk);
  };
  try { walk(JSON.parse(json)); } catch { return []; }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(json, out);
  return out;
}

// Every hub in the given notes (views: pass only readable ones), main tab first, then each tab.
export function collectHubs(notes: Iterable<Note>): HubRef[] {
  const out: HubRef[] = [];
  for (const n of notes) {
    if (n.archivedAt) continue;
    const add = (json: string, tabId: string | null) => {
      for (const hub of hubsInContent(json)) out.push({ ...hub, noteId: n.id, noteTitle: n.title, tabId });
    };
    add(n.content, null);
    for (const t of n.tabs) add(t.content, t.id);
  }
  return out;
}

// Where a link of `relation` goes among a hub's links (an index into them): at the end of its
// group, the groups in RELATIONS order, so a hub's links always read grouped.
export function linkInsertIndex(links: { relation: HubRelation }[], relation: HubRelation): number {
  const rank = RELATIONS.indexOf(relation);
  const after = links.findIndex((l) => RELATIONS.indexOf(l.relation) > rank);
  return after < 0 ? links.length : after;
}

import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';

// Which blocks a record is shown inside (2026-11-14, Examples: an Example's chip in an argument's
// point, a case study's part, a question's answer): the nearest note block around each chip or card
// of it, by its node's name. Derived from the notes, never stored, so the Example's card can say
// where it's used without a link made by hand (and a study mode can ask "what is this an example
// of?"). Pure: one note's stored content (JSON) at a time.

interface JsonNode { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

const SHOWS = new Set(['glossaryChip', 'glossaryCard']);

export function blocksHolding(json: string, entryId: string): string[] {
  if (!json || !json.includes(entryId)) return [];
  const out: string[] = [];
  const walk = (n: JsonNode, around: string | null) => {
    if (n.type && SHOWS.has(n.type) && n.attrs?.entryId === entryId) { if (around) out.push(around); return; }
    const inside = n.type && NOTE_BLOCK_NODES.has(n.type) ? n.type : around;
    n.content?.forEach((c) => walk(c, inside));
  };
  try { walk(JSON.parse(json) as JsonNode, null); } catch { return []; }
  return out;
}

import { Extension } from '@tiptap/core';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import { LABELS } from '@/config/labels';
import { prosConsJustTyped, quoteJustTyped, typesJustTyped } from '@/utils/blockOffers';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { typingOfferPlugin, type TypingOfferMatch } from './typingOffer';
import { placeBlock } from './blockDesigns';
import { quoteNodeFor } from './Quote';
import { typesNodeFor } from './Types';
import { prosConsNodeFor } from './ProsCons';

// Blocks offered as you type (asked for 2026-10-16), the same way an acronym is: writing that
// reads like a block gets a chip offering to make it one, through "offer as you type"
// (typingOffer.ts). The rules for spotting it are utils/blockOffers.ts.
//   - Quote: a line that is only a quotation (who said it may come first), when its closing quote
//     mark is typed. Accepting turns the line into a quote block, who said it in its Who field.
//   - Types: "There are three types of rock:" (and the like), on the colon or full stop. Accepting
//     puts a types block for rock with three empty types after the line, the cursor in the first.
//   - Pros and cons: "The pros and cons of renting:", likewise; the cursor in the first pro.
// Only in a plain paragraph, never inside a block or in code. A new block offer is one more spec
// here (and its rule in utils/blockOffers.ts).

interface QuoteOffer extends TypingOfferMatch { quote: string; who: string }
interface PartsOffer extends TypingOfferMatch { subject: string; count: number }

// The paragraph the cursor is in, if it's a plain one outside any block, with what's before the cursor.
function plainLine(state: EditorState): { before: string; start: number; atEnd: boolean } | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $c = sel.$from;
  if ($c.parent.type.name !== 'paragraph') return null;
  for (let d = $c.depth - 1; d > 0; d--) if (NOTE_BLOCK_NODES.has($c.node(d).type.name)) return null;
  if ($c.marks().some((m) => m.type.name === 'code')) return null;
  return { before: $c.parent.textBetween(0, $c.parentOffset, undefined, '￼'), start: $c.start(), atEnd: $c.parentOffset === $c.parent.content.size };
}

export function findQuoteOffer(state: EditorState, passedOver: ReadonlySet<string> = new Set()): QuoteOffer | null {
  const line = plainLine(state);
  if (!line?.atEnd || !state.schema.nodes.quoteBlock) return null;
  const found = quoteJustTyped(line.before);
  if (!found || passedOver.has(found.quote)) return null;
  const $c = state.selection.$from;
  const holder = $c.node($c.depth - 1);
  if (!holder.canReplaceWith($c.index($c.depth - 1), $c.index($c.depth - 1) + 1, state.schema.nodes.quoteBlock)) return null;
  return { from: line.start, to: line.start + line.before.length, id: found.quote, ...found };
}

export function findTypesOffer(state: EditorState, passedOver: ReadonlySet<string> = new Set()): PartsOffer | null {
  const line = plainLine(state);
  if (!line || !state.schema.nodes.types) return null;
  const found = typesJustTyped(line.before);
  const id = found ? `types:${found.subject.toLowerCase()}` : '';
  if (!found || passedOver.has(id)) return null;
  return { from: line.start + found.from, to: line.start + found.to, id, subject: found.subject, count: found.count };
}

export function findProsConsOffer(state: EditorState, passedOver: ReadonlySet<string> = new Set()): PartsOffer | null {
  const line = plainLine(state);
  if (!line || !state.schema.nodes.prosCons) return null;
  const found = prosConsJustTyped(line.before);
  const id = found ? `pc:${found.subject.toLowerCase()}` : '';
  if (!found || passedOver.has(id)) return null;
  return { from: line.start + found.from, to: line.start + found.to, id, subject: found.subject, count: 0 };
}

// The line becomes the quote; the cursor at the end of who said it (or of the quote), so Enter
// goes on through its fields and out.
function acceptQuote(state: EditorState, o: QuoteOffer) {
  const $at = state.doc.resolve(o.from);
  const node = quoteNodeFor(state, o.quote, o.who);
  const at = $at.before();
  const tr = state.tr.replaceWith(at, $at.after(), node);
  let end = at + 1 + node.child(0).nodeSize - 1;
  if (o.who) node.forEach((c, offset) => { if (c.attrs.field === 'who') end = at + 1 + offset + c.nodeSize - 1; });
  return tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView();
}

// The block after the line, the cursor in its first empty part (the first type's name; the first pro).
function acceptAfterLine(state: EditorState, o: PartsOffer, node: ReturnType<typeof typesNodeFor>) {
  const tr = state.tr;
  const at = placeBlock(tr, o.to, node);
  if (at === null) return null;
  const first = node.child(0).nodeSize;
  return tr.setSelection(TextSelection.create(tr.doc, at + 1 + first + 2)).scrollIntoView();
}

const chipTitle = LABELS.noteBlocks.offers.title;

export const BlockOffers = Extension.create({
  name: 'blockOffers',
  // Alongside the other offers, before the blocks' keys: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const noteId = () => objectTriggerStorage(this.editor).getContext()?.noteId ?? null;
    const O = LABELS.noteBlocks.offers;
    return [
      typingOfferPlugin<QuoteOffer>({
        name: 'quoteOffer',
        find: (state, typed, _n, passed) => (/["'”’]$/.test(typed) ? findQuoteOffer(state, passed) : null),
        chip: (o) => ({ text: O.quote, strong: o.who ? O.quoteBy(o.who) : undefined, title: chipTitle }),
        accept: acceptQuote,
      }, noteId),
      typingOfferPlugin<PartsOffer>({
        name: 'typesOffer',
        find: (state, typed, _n, passed) => (/[:.]$/.test(typed) ? findTypesOffer(state, passed) : null),
        chip: (o) => ({ text: O.types, strong: O.typesOf(o.subject, o.count), title: chipTitle }),
        accept: (state, o) => acceptAfterLine(state, o, typesNodeFor(state, o.subject, o.count)),
      }, noteId),
      typingOfferPlugin<PartsOffer>({
        name: 'prosConsOffer',
        find: (state, typed, _n, passed) => (/[:.]$/.test(typed) ? findProsConsOffer(state, passed) : null),
        chip: (o) => ({ text: O.prosCons, strong: o.subject, title: chipTitle }),
        accept: (state, o) => acceptAfterLine(state, o, prosConsNodeFor(state, o.subject)),
      }, noteId),
    ];
  },
});

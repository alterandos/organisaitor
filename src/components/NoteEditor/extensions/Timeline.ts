import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Fragment, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import { Mapping } from '@tiptap/pm/transform';
import { LABELS } from '@/config/labels';
import { readTimeline, type TimelineOrder } from '@/utils/timelineWhen';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, selectButton, pillButton, type BlockDesign } from './blockDesigns';

// A timeline in a note (`\timeline`): entries on a vertical line, each a short "when" label (free
// text: "1914", "Day 3", "c. 1200 BC", "Q3") over ordinary rich text. Note-taking structure only;
// nothing outside the note knows about it.
//
//   timeline       variant attr: how it's drawn ('rail' down the page, 'horizontal' along a line
//                  with entries above and below). A new style is a value here plus its CSS under
//                  [data-variant="…"] — the content never changes.
//                  order attr: 'asc' / 'desc' by the entries' Whens (utils/timelineWhen.ts), or
//                  'manual' (as typed).
//   timelineItem   one entry: its When, then its body
//   timelineWhen   the label by the dot
//
// Keys, list-like: Enter in the When goes to the body; Enter on an empty last line of the body
// starts the next entry; Enter on an entry that's still empty leaves the timeline. Backspace at
// the start of a When or a body steps back rather than merging the two.
//
// Sorting happens when the cursor leaves an entry (never while you type in it), and the entry
// that moved flashes in its new place.

export const TIMELINE_VARIANTS = ['rail', 'horizontal'] as const;
export type TimelineVariant = typeof TIMELINE_VARIANTS[number];
export const TIMELINE_ORDERS = ['asc', 'desc', 'manual'] as const satisfies readonly TimelineOrder[];

const BODY = '(paragraph | bulletList | orderedList | blockquote)+';

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Timeline = Node.create({
  name: 'timeline',
  group: 'block',
  content: 'timelineItem+',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: {
        default: 'rail' satisfies TimelineVariant,
        parseHTML: (el) => oneOf(TIMELINE_VARIANTS, el.getAttribute('data-variant'), 'rail'),
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
      order: {
        default: 'asc' satisfies TimelineOrder,
        parseHTML: (el) => oneOf(TIMELINE_ORDERS, el.getAttribute('data-order'), 'asc'),
        renderHTML: (attrs) => ({ 'data-order': attrs.order }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="timeline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'timeline', 'data-note-block': '' }), 0];
  },
});

export const TimelineItem = Node.create({
  name: 'timelineItem',
  content: `timelineWhen ${BODY}`,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="timeline-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'timeline-item' }), 0];
  },
});

export const TimelineWhen = Node.create({
  name: 'timelineWhen',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-timeline-when]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-timeline-when': '' }), 0];
  },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface EntryAt {
  item:        PMNode;
  itemPos:     number;
  itemDepth:   number;
  timeline:    PMNode;
  timelinePos: number;
  index:       number;   // the entry's index in its timeline
}

// The (innermost) timeline entry holding a position.
function entryAt($pos: ResolvedPos): EntryAt | null {
  for (let d = $pos.depth; d > 1; d--) {
    if ($pos.node(d).type.name !== 'timelineItem') continue;
    return { item: $pos.node(d), itemPos: $pos.before(d), itemDepth: d, timeline: $pos.node(d - 1), timelinePos: $pos.before(d - 1), index: $pos.index(d - 1) };
  }
  return null;
}

const isEmptyEntry = (item: PMNode) =>
  item.childCount === 2 && item.child(0).content.size === 0 && item.child(1).type.name === 'paragraph' && item.child(1).content.size === 0;

// Inside an entry's When, at its end.
const whenEnd = (itemPos: number, item: PMNode) => itemPos + 2 + item.child(0).content.size;

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Inserting ────────────────────────────────────────────────────────────────

// Replaces from..to (the typed `\timeline`) with a new timeline holding one empty entry, cursor in
// its When. An empty line becomes the timeline; otherwise it goes in after the line (or after the
// nearest container that can hold it — after the list, after another timeline). null if the
// schema has no timeline or nowhere takes one.
export function insertTimeline(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.timeline;
  const node = type?.createAndFill();
  if (!node) return null;
  // The space before a `\` typed after other words goes too ("History \timeline" → "History").
  const $start = state.doc.resolve(from);
  while (from > $start.start() && /\s/.test(state.doc.textBetween(from - 1, from))) from--;
  const tr = state.tr.delete(from, to);
  const $pos = tr.doc.resolve(from);
  let at: number | null = null;
  const d = $pos.depth;
  if ($pos.parent.isTextblock && $pos.parent.content.size === 0 && d > 0
    && $pos.node(d - 1).canReplaceWith($pos.index(d - 1), $pos.index(d - 1) + 1, type)) {
    at = $pos.before(d);
    tr.replaceWith(at, $pos.after(d), node);
  } else {
    for (let depth = d; depth > 0; depth--) {
      const index = $pos.indexAfter(depth - 1);
      if (!$pos.node(depth - 1).canReplaceWith(index, index, type)) continue;
      at = $pos.after(depth);
      tr.insert(at, node);
      break;
    }
  }
  if (at === null) return null;
  return tr.setSelection(TextSelection.create(tr.doc, at + 3)).scrollIntoView();
}

// A new empty entry at `pos` (between entries, or at the end of the timeline's content), cursor in
// its When.
function insertEntry(tr: Transaction, pos: number): Transaction {
  const entry = tr.doc.type.schema.nodes.timelineItem.createAndFill()!;
  tr.insert(pos, entry);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 2)).scrollIntoView();
}

// The "+ Add entry" button: a new entry at the end of the timeline whose content ends at `end`.
export function addEntryAtEnd(view: EditorView, end: number): void {
  view.dispatch(insertEntry(view.state.tr, end));
  view.focus();
}

// Leaves the timeline from an empty entry (wherever it is: a new entry needn't be the last, since
// the others sort around it): the entry goes, an empty line follows the timeline (or replaces
// it, if that was its only entry).
function leaveTimeline(state: EditorState, at: EntryAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const paragraph = state.schema.nodes.paragraph.create();
  const tr = state.tr;
  if (at.timeline.childCount === 1) {
    tr.replaceWith(at.timelinePos, at.timelinePos + at.timeline.nodeSize, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, at.timelinePos + 1));
  } else {
    tr.delete(at.itemPos, at.itemPos + at.item.nodeSize);
    const after = at.timelinePos + at.timeline.nodeSize - at.item.nodeSize;
    tr.insert(after, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }
  dispatch(tr.scrollIntoView());
  return true;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const timelineEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const at = entryAt($from);
  if (!at) return false;
  const parent = $from.parent;

  if (parent.type.name === 'timelineWhen') {
    if (isEmptyEntry(at.item)) return leaveTimeline(state, at, dispatch);
    if (dispatch) {
      const tr = state.tr;
      if (!empty) tr.deleteSelection();
      const item = tr.doc.nodeAt(at.itemPos)!;
      const bodyStart = at.itemPos + 1 + item.child(0).nodeSize;
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(bodyStart + 1))).scrollIntoView());
    }
    return true;
  }

  // An empty last line directly in the body: the next entry (or, if the entry is still empty, out).
  const inBody = $from.depth === at.itemDepth + 1 && parent.type.name === 'paragraph';
  if (!inBody || !empty || parent.content.size > 0 || $from.index(at.itemDepth) !== at.item.childCount - 1) return false;
  if (isEmptyEntry(at.item)) return leaveTimeline(state, at, dispatch);
  if (dispatch) {
    const tr = state.tr;
    let end = at.itemPos + at.item.nodeSize;
    if (at.item.childCount > 2) {
      tr.delete($from.before(), $from.after());
      end -= parent.nodeSize;
    }
    dispatch(insertEntry(tr, end));
  }
  return true;
};

export const timelineBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const at = entryAt($from);
  if (!at) return false;
  const parent = $from.parent;

  if (parent.type.name === 'timelineWhen') {
    if (isEmptyEntry(at.item)) {
      if (at.timeline.childCount === 1) {
        if (dispatch) {
          const tr = state.tr.replaceWith(at.timelinePos, at.timelinePos + at.timeline.nodeSize, state.schema.nodes.paragraph.create());
          dispatch(tr.setSelection(TextSelection.create(tr.doc, at.timelinePos + 1)).scrollIntoView());
        }
        return true;
      }
      if (dispatch) {
        const tr = state.tr.delete(at.itemPos, at.itemPos + at.item.nodeSize);
        dispatch(tr.setSelection(Selection.near(tr.doc.resolve(at.itemPos), at.index > 0 ? -1 : 1)).scrollIntoView());
      }
      return true;
    }
    // A filled entry: step back to the end of the one before (nothing before the first).
    if (at.index > 0 && dispatch) {
      dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(at.itemPos), -1)).scrollIntoView());
    }
    return true;
  }

  // The start of the body's first line: back to the end of the When, never merged into it. An
  // empty first line with more below goes.
  const firstBodyLine = $from.depth === at.itemDepth + 1 && $from.index(at.itemDepth) === 1;
  if (!firstBodyLine) return false;
  if (dispatch) {
    const tr = state.tr;
    if (parent.content.size === 0 && at.item.childCount > 2) tr.delete($from.before(), $from.after());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, whenEnd(at.itemPos, at.item))).scrollIntoView());
  }
  return true;
};

// Delete at the end of a When, or at the end of an entry with another after it, would merge two
// parts of the timeline into one; it removes an empty next entry and otherwise does nothing.
export const timelineDelete: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  const at = entryAt($from);
  if (!at) return false;
  if ($from.parent.type.name === 'timelineWhen') return true;
  const lastLine = $from.depth === at.itemDepth + 1 && $from.index(at.itemDepth) === at.item.childCount - 1;
  if (!lastLine || at.index === at.timeline.childCount - 1) return false;
  const nextPos = at.itemPos + at.item.nodeSize;
  const next = state.doc.nodeAt(nextPos)!;
  if (isEmptyEntry(next) && dispatch) dispatch(state.tr.delete(nextPos, nextPos + next.nodeSize));
  return true;
};

// ── Sorting and settings ─────────────────────────────────────────────────────

interface TimelinePluginState {
  moved: { pos: number; until: number } | null;   // the entry that just moved, flashed in its new place
}
interface TimelineMeta {
  sorting?:    true;     // this transaction already sorted (or set) a timeline: don't sort again
  moved?:      number;   // the position of the entry it moved
  clearMoved?: true;
}

const timelineKey = new PluginKey<TimelinePluginState>('timeline');
const MOVED_MS = 1600;

// Puts the timeline at `pos` into its order (nothing for 'manual' or one already in order),
// keeping the selection where it was in its entry's text. `pinPos`: an entry that stays at its
// index while the others sort around it (the one the cursor just went into: a new entry stays
// where it was made, rather than jumping along with the entry it followed). Returns each entry's
// new index by its old one, or null if nothing moved.
export function sortTimeline(tr: Transaction, pos: number, pinPos?: number): number[] | null {
  const node = tr.doc.nodeAt(pos);
  if (!node || node.type.name !== 'timeline' || node.attrs.order === 'manual') return null;
  const items: PMNode[] = [];
  const offsets: number[] = [];
  node.forEach((item, offset) => { items.push(item); offsets.push(pos + 1 + offset); });
  const pin = pinPos === undefined ? -1 : offsets.indexOf(pinPos);
  const rest = items.map((_, i) => i).filter((i) => i !== pin);
  const order = readTimeline(rest.map((i) => items[i].child(0).textContent), node.attrs.order as TimelineOrder).order.map((k) => rest[k]);
  if (pin >= 0) order.splice(pin, 0, pin);
  if (order.every((from, to) => from === to)) return null;

  const starts: number[] = [];
  let p = pos + 1;
  for (const item of items) { starts.push(p); p += item.nodeSize; }
  const locate = (x: number) => {
    const i = starts.findIndex((s, k) => x > s && x < s + items[k].nodeSize);
    return i < 0 ? null : { i, off: x - starts[i] };
  };
  const a = locate(tr.selection.anchor);
  const h = locate(tr.selection.head);

  const newIndex: number[] = [];
  order.forEach((from, to) => { newIndex[from] = to; });
  const newStart = (i: number) => pos + 1 + order.slice(0, newIndex[i]).reduce((sum, k) => sum + items[k].nodeSize, 0);

  tr.replaceWith(pos + 1, pos + node.nodeSize - 1, Fragment.from(order.map((i) => items[i])));
  if (a && h && a.i === h.i) tr.setSelection(TextSelection.create(tr.doc, newStart(a.i) + a.off, newStart(h.i) + h.off));
  else if (a || h) { const x = (a ?? h)!; tr.setSelection(TextSelection.create(tr.doc, newStart(x.i) + x.off)); }
  return newIndex;
}

// The style and sort buttons, and the right-click menu.
export function setTimelineSettings(view: EditorView, pos: number, attrs: { variant?: TimelineVariant; order?: TimelineOrder }): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'timeline') return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  if (attrs.order) sortTimeline(tr, pos);
  view.dispatch(tr.setMeta(timelineKey, { sorting: true } satisfies TimelineMeta));
}

// The timeline a DOM element is in, as a document position (for the right-click menu).
export function timelinePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="timeline"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'timeline' ? pos : null;
  } catch { return null; }
}

// After the cursor leaves an entry: sort its timeline, and flash the entry if it moved.
function sortOnLeave(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (trs.some((t) => (t.getMeta(timelineKey) as TimelineMeta | undefined)?.sorting)) return null;
  if (!trs.some((t) => t.selectionSet || t.docChanged)) return null;
  const left = entryAt(oldState.selection.$head);
  if (!left || left.timeline.attrs.order === 'manual') return null;

  const mapping = new Mapping();
  trs.forEach((t) => mapping.appendMapping(t.mapping));
  const mapped = mapping.mapResult(left.itemPos, 1);
  if (mapped.deleted || mapped.pos + 1 > newState.doc.content.size) return null;
  const still = entryAt(newState.doc.resolve(mapped.pos + 1));
  if (!still || still.itemPos !== mapped.pos) return null;
  const sel = newState.selection;
  const now = entryAt(sel.$head);
  if (now?.itemPos === still.itemPos) return null;
  // A selection reaching into this timeline from elsewhere: leave it be until it settles.
  if (!sel.empty && (entryAt(sel.$anchor)?.timelinePos === still.timelinePos || now?.timelinePos === still.timelinePos)) return null;

  const tr = newState.tr;
  const newIndex = sortTimeline(tr, still.timelinePos, now?.timelinePos === still.timelinePos ? now.itemPos : undefined);
  if (!newIndex) return null;
  const meta: TimelineMeta = { sorting: true };
  if (newIndex[still.index] !== still.index) {
    const timeline = tr.doc.nodeAt(still.timelinePos)!;
    let pos = still.timelinePos + 1;
    for (let k = 0; k < newIndex[still.index]; k++) pos += timeline.child(k).nodeSize;
    meta.moved = pos;
  }
  return tr.setMeta(timelineKey, meta);
}

function applyPluginState(tr: Transaction, value: TimelinePluginState): TimelinePluginState {
  const meta = tr.getMeta(timelineKey) as TimelineMeta | undefined;
  if (meta?.clearMoved) return { moved: null };
  if (meta?.moved !== undefined) return { moved: { pos: meta.moved, until: Date.now() + MOVED_MS } };
  if (value.moved && tr.docChanged) {
    const r = tr.mapping.mapResult(value.moved.pos, 1);
    return { moved: r.deleted ? null : { ...value.moved, pos: r.pos } };
  }
  return value;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

// Per timeline: the style and sort buttons (top right), "+ Add entry" (at the end), and, in the
// horizontal style, each entry's column and side of the line. Per entry: placeholders (an empty
// When always; an empty body line while the cursor's on it), the year a When was read with but
// doesn't say ("23 July · 1914"), the flash of an entry that just moved, and which entry is being
// edited (its dot fills). Hover affordances are always shown on touch, which has no hover. Own
// attribute names, so the editor-wide Placeholder extension's data-placeholder never collides.
function timelineDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const labels = LABELS.noteBlocks.timeline;
  const moved = timelineKey.getState(state)?.moved;
  const flashing = moved && Date.now() < moved.until ? moved.pos : null;
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'timeline') return !node.isTextblock;
    const t = n++;
    const variant = node.attrs.variant as TimelineVariant;
    const order = node.attrs.order as TimelineOrder;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, order, node.attrs),
      { side: -1, key: `timeline-tools-${t}-${variant}-${order}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    decos.push(Decoration.widget(pos + node.nodeSize - 1, addEntryButton,
      { side: 1, key: `timeline-add-${t}`, ignoreSelection: true, stopEvent: () => true }));
    if (variant === 'horizontal') decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--tl-end: ${node.childCount + 2}` }));

    const whens: string[] = [];
    node.forEach((item) => { whens.push(item.child(0).textContent); });
    const { inferredYear } = readTimeline(whens, 'manual');
    node.forEach((item, offset, index) => {
      const itemPos = pos + 1 + offset;
      const when = item.child(0);
      const attrs: Record<string, string> = {};
      if (variant === 'horizontal') {
        attrs.style = `--tl-col: ${index + 1}`;
        attrs['data-tl-side'] = index % 2 ? 'below' : 'above';
      }
      if (flashing === itemPos) attrs['data-tl-moved'] = '';
      if (Object.keys(attrs).length) decos.push(Decoration.node(itemPos, itemPos + item.nodeSize, attrs));
      if (when.content.size === 0) {
        decos.push(Decoration.node(itemPos + 1, itemPos + 1 + when.nodeSize, { 'data-tl-empty': '', 'data-tl-placeholder': labels.whenPlaceholder }));
      } else if (inferredYear[index] !== null) {
        const year = inferredYear[index]!;
        decos.push(Decoration.widget(itemPos + 2 + when.content.size, () => inferredYearChip(year),
          { side: 1, key: `timeline-year-${t}-${index}-${year}`, ignoreSelection: true, marks: [] }));
      }
    });
    return false;
  });
  if (n === 0) return null;
  const { $from } = state.selection;
  const at = entryAt($from);
  if (at) {
    decos.push(Decoration.node(at.itemPos, at.itemPos + at.item.nodeSize, { 'data-tl-current': '' }));
    const p = $from.parent;
    if (state.selection.empty && p.type.name === 'paragraph' && p.content.size === 0 && $from.depth === at.itemDepth + 1) {
      decos.push(Decoration.node($from.before(), $from.after(), { 'data-tl-empty': '', 'data-tl-placeholder': LABELS.noteBlocks.timeline.bodyPlaceholder }));
    }
  }
  return DecorationSet.create(state.doc, decos);
}

const formatYear = (y: number) => (y < 0 ? `${-y} BC` : `${y}`);

function inferredYearChip(year: number): HTMLElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.setAttribute('data-tl-inferred', '');
  chip.textContent = formatYear(year);
  chip.title = LABELS.noteBlocks.timeline.inferredYear;
  return chip;
}

// Its designs (Block designs, blockDesigns.ts): small line drawings, stroked in currentColor.
const DESIGN_ICONS: Record<TimelineVariant, string> = {
  rail:       '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3.5v9"/><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><path d="M8 3.5h6M8 12.5h4.5"/></svg>',
  horizontal: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h13"/><circle cx="4.5" cy="8" r="1.6"/><circle cx="11.5" cy="8" r="1.6"/><path d="M4.5 6.2V2.5M11.5 9.8v3.7"/></svg>',
};
export const TIMELINE_DESIGNS: BlockDesign<TimelineVariant>[] = TIMELINE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.timeline.styles[id], icon: DESIGN_ICONS[id] }));
const NEXT_ORDER: Record<TimelineOrder, TimelineOrder> = { asc: 'desc', desc: 'manual', manual: 'asc' };

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: TimelineVariant, order: TimelineOrder, attrs: Record<string, unknown>): HTMLElement {
  const labels = LABELS.noteBlocks.timeline;
  const bar = blockPill('data-timeline-tools');
  const set = (attrs: { variant?: TimelineVariant; order?: TimelineOrder }) => {
    const p = getPos();
    if (p !== undefined && view.editable) setTimelineSettings(view, p - 1, attrs);
  };
  const sort = pillButton(labels.sortTitle(labels.orders[order]), () => set({ order: NEXT_ORDER[order] }), labels.orders[order]);
  sort.setAttribute('data-tl-tool', 'order');
  sort.setAttribute('data-order', order);
  bar.append(designButtons(TIMELINE_DESIGNS, variant, (v) => set({ variant: v })), sort, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

function addEntryButton(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.contentEditable = 'false';
  button.setAttribute('data-timeline-add', '');
  button.setAttribute('aria-label', LABELS.noteBlocks.timeline.addEntry);
  const label = document.createElement('span');
  label.textContent = LABELS.noteBlocks.timeline.addEntry;
  button.append(label);
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', (e) => {
    e.preventDefault();
    const pos = getPos();
    if (pos !== undefined && view.editable) addEntryAtEnd(view, pos);
  });
  return button;
}

// The keys, the sorting and the drawing, separate from the nodes so its priority (keys before
// StarterKit's Enter/Backspace) doesn't move the nodes up the schema: the first block node is what
// ProseMirror fills empty content with, and that must stay the paragraph.
export const TimelineBehaviour = Extension.create({
  name: 'timelineBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return { Enter: run(timelineEnter), Backspace: run(timelineBackspace), Delete: run(timelineDelete) };
  },

  addProseMirrorPlugins() {
    return [new Plugin<TimelinePluginState>({
      key: timelineKey,
      state: { init: () => ({ moved: null }), apply: applyPluginState },
      appendTransaction: sortOnLeave,
      props: { decorations: timelineDecorations },
      // Ends the flash: one transaction once it's over.
      view: () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timerFor = 0;
        return {
          update(view) {
            const m = timelineKey.getState(view.state)?.moved;
            if (!m || m.until === timerFor) return;
            clearTimeout(timer);
            timerFor = m.until;
            timer = setTimeout(() => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(timelineKey, { clearMoved: true } satisfies TimelineMeta));
            }, Math.max(0, m.until - Date.now()));
          },
          destroy() { clearTimeout(timer); },
        };
      },
    })];
  },
});

export const TimelineExtensions = [Timeline, TimelineItem, TimelineWhen, TimelineBehaviour];

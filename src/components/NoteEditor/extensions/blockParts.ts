import { Extension } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { openContextMenuAt } from '@/contextMenu/open';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { removeLink } from '@/services/noteHubs';
import { BLOCK_PART_NODES, NOTE_BLOCK_NODES } from '../blockNodes';
import { popoverClass } from './blockDesigns';
import { togglePick } from './blockPicks';
import { effectiveLevels, subtreeEnd } from './hierarchyLayout';
import { deletePart } from './Breakdown';
import { deleteStage } from './Cycle';
import { deleteHierarchyItem } from './Hierarchy';
import { deleteStep as deleteKeyStep } from './IdKey';
import { deleteItem as deleteInboxItem } from './Inbox';
import { deleteOption } from './Options';
import { deleteLayer } from './Pyramid';
import { deleteStep } from './Steps';
import { deleteType } from './Types';

// The part handle (CLAUDE.md "Block designs"): every part of every note block can be moved,
// duplicated and deleted in the same ways, whatever the block.
//   Keys (cursor in the part): Alt+↑ / Alt+↓ move it, Alt+Shift+↓ duplicates it (on a plain line
//   the same key duplicates the line: DuplicateLine), Ctrl+Shift+Backspace deletes it.
//   Hover: a ⋮⋮ grip by the part; drag it onto another part to move there, click it for the menu.
//   Touch: the grip shows for the part holding the cursor; tap for the menu, drag to move.
//   Right-click on a part: the same actions, at the top of the menu, with Add before / Add after.
// What a part is: one of the node types in PART_SPECS, wherever it sits (a comparison's points are
// parts of its sides, which are parts of the comparison). Its siblings of the same type are where it
// can move; a hierarchy item moves with everything under it, among the items at its level. Nothing
// is moved or deleted if the block's schema wouldn't allow the result (a cycle keeps two stages).
// A new block lists its part type here (and in blockNodes.ts BLOCK_PART_NODES if Ctrl+click picks it).

interface PartSpec {
  // Whether the person can put the parts in their own order (a timeline sorted by date can't).
  move?: (block: PMNode) => boolean;
  duplicate?: false;
  // New ones come from somewhere else (sending to an inbox, linking to a hub), not from an empty part.
  add?: false;
  // Attributes a new part next to this one takes from it (a hierarchy item's level).
  keep?: string[];
  // The block's own delete, when deleting means more than removing the node (or asks first).
  remove?: (view: EditorView, at: PartAt) => void;
  // Its own right-click menu already offers Delete (and more).
  ownMenu?: true;
}

const never = () => false;
export const PART_SPECS: Record<string, PartSpec> = {
  timelineItem:     { move: (b) => b.attrs.order === 'manual' },
  cycleStage:       { remove: (v, at) => { deleteStage(v, at.pos); } },
  breakdownPart:    { remove: (v, at) => { deletePart(v, at.pos); } },
  hierarchyItem:    { keep: ['level'], remove: (v, at) => { void deleteHierarchyItem(v, at.parentPos, at.index); } },
  pyramidLayer:     { remove: (v, at) => { deleteLayer(v, at.pos); } },
  stepsStep:        { remove: (v, at) => { deleteStep(v, at.pos); } },
  typesItem:        { remove: (v, at) => { deleteType(v, at.pos); } },
  idKeyStep:        { remove: (v, at) => { deleteKeyStep(v, at.pos); } },
  idKeyLead:        {},
  optionsItem:      { remove: (v, at) => { deleteOption(v, at.pos); } },
  conclusionReason: {},
  prosConsPoint:    {},
  compareSide:      {},
  comparePoint:     {},
  ceItem:           {},
  vennItem:         { keep: ['sets'] },
  inboxItem:        { move: never, duplicate: false, add: false, ownMenu: true, remove: (v, at) => deleteInboxItem(v, at.pos) },
  // A hub's links are put in order by hand only in its Fact sheet design (List groups them by relation).
  hubLink:          { move: (b) => b.attrs.variant === 'sheet', duplicate: false, add: false, ownMenu: true, remove: (v, at) => removeLink(v, at.pos) },
};

export interface PartAt {
  pos: number; node: PMNode;            // the part
  parentPos: number; parent: PMNode;    // what it's a child of (the block, or a part of it)
  index: number;                        // its index in the parent
  blockPos: number; block: PMNode;      // the note block it belongs to
}

function partAtPos(doc: PMNode, partPos: number): PartAt | null {
  const $r = doc.resolve(partPos);
  const node = $r.nodeAfter;
  if (!node || !PART_SPECS[node.type.name] || $r.depth < 1) return null;
  for (let d = $r.depth; d >= 1; d--) {
    if (!NOTE_BLOCK_NODES.has($r.node(d).type.name)) continue;
    return { pos: partPos, node, parentPos: $r.before(), parent: $r.parent, index: $r.index(), blockPos: $r.before(d), block: $r.node(d) };
  }
  return null;
}

// The part starting right at a position (the node a pointer is over), else the innermost part
// around it (where the cursor is).
export function partAround(doc: PMNode, pos: number): PartAt | null {
  const at = partAtPos(doc, pos);
  if (at) return at;
  const $p = doc.resolve(pos);
  for (let d = $p.depth; d >= 1; d--) {
    if (PART_SPECS[$p.node(d).type.name]) return partAtPos(doc, $p.before(d));
  }
  return null;
}

// ── Units: what moves together ───────────────────────────────────────────────

interface Unit { from: number; to: number }   // child indices in the parent, [from, to)

export function unitsOf(at: PartAt): { units: Unit[]; mine: number } {
  const units: Unit[] = [];
  if (at.node.type.name === 'hierarchyItem') {
    const raw: number[] = [];
    at.parent.forEach((c) => raw.push(c.attrs.level as number));
    const lv = effectiveLevels(raw);
    const level = lv[at.index];
    let lo = at.index;
    while (lo > 0 && lv[lo - 1] >= level) lo--;
    let hi = at.index + 1;
    while (hi < lv.length && lv[hi] >= level) hi++;
    for (let s = lo; s < hi; s++) if (lv[s] === level) units.push({ from: s, to: subtreeEnd(lv, s) });
  } else {
    at.parent.forEach((c, _o, i) => { if (c.type === at.node.type) units.push({ from: i, to: i + 1 }); });
  }
  return { units, mine: units.findIndex((u) => u.from === at.index) };
}

const childrenOf = (n: PMNode) => { const out: PMNode[] = []; n.forEach((c) => out.push(c)); return out; };
const childPos = (at: PartAt, index: number) => {
  let p = at.parentPos + 1;
  for (let i = 0; i < index; i++) p += at.parent.child(i).nodeSize;
  return p;
};

const canReorder = (at: PartAt): boolean => (PART_SPECS[at.node.type.name].move ?? (() => true))(at.block);

// The other groups in the block the part can go to: containers of the same kind as its own (the
// other list of pros and cons, another side of a comparison, another cause-and-effect column,
// another step of a key). A part that sits right in its block has none.
export function otherGroups(at: PartAt): { pos: number; node: PMNode }[] {
  if (at.parentPos === at.blockPos || !canReorder(at)) return [];
  const out: { pos: number; node: PMNode }[] = [];
  at.block.descendants((n, p) => {
    if (n.type !== at.parent.type) return true;
    const pos = at.blockPos + 1 + p;
    if (pos !== at.parentPos) out.push({ pos, node: n });
    return false;
  });
  return out;
}

export const canMovePart = (at: PartAt): boolean => canReorder(at) && (unitsOf(at).units.length > 1 || otherGroups(at).length > 0);
export const canDuplicatePart = (at: PartAt): boolean => PART_SPECS[at.node.type.name].duplicate !== false;

// Moves the part (and what moves with it) into `containerPos` (its own parent, or another group),
// before that container's child `index`. Refused if either container's schema wouldn't allow it
// (the last pro can't leave its list). The cursor, if it was in the part, stays at its place in it.
export function movePartToSlot(view: EditorView, at: PartAt, containerPos: number, index: number): boolean {
  if (!canReorder(at)) return false;
  const container = view.state.doc.nodeAt(containerPos);
  if (!container || container.type !== at.parent.type) return false;
  const { units, mine } = unitsOf(at);
  const u = units[mine];
  const kids = childrenOf(at.parent);
  const moving = kids.slice(u.from, u.to);
  const rest = kids.filter((_, i) => i < u.from || i >= u.to);
  const unitFrom = childPos(at, u.from);
  const unitTo = childPos(at, u.to);
  const sel = view.state.selection.from;
  const inside = sel > unitFrom && sel < unitTo ? sel - unitFrom : null;
  let tr;
  let newFrom: number;
  if (containerPos === at.parentPos) {
    if (index >= u.from && index <= u.to) return false;    // where it already is
    const insertAt = index > u.from ? index - (u.to - u.from) : index;
    rest.splice(insertAt, 0, ...moving);
    const content = Fragment.from(rest);
    if (!at.parent.type.validContent(content)) return false;
    const start = at.parentPos + 1;
    tr = view.state.tr.replaceWith(start, start + at.parent.content.size, content);
    newFrom = start;
    for (let i = 0; i < insertAt; i++) newFrom += rest[i].nodeSize;
  } else {
    const theirs = childrenOf(container);
    if (!at.parent.type.validContent(Fragment.from(rest))) return false;
    if (!container.type.validContent(Fragment.from([...theirs.slice(0, index), ...moving, ...theirs.slice(index)]))) return false;
    let insertPos = containerPos + 1;
    for (let i = 0; i < index; i++) insertPos += theirs[i].nodeSize;
    tr = view.state.tr.delete(unitFrom, unitTo);
    newFrom = tr.mapping.map(insertPos);
    tr.insert(newFrom, moving);
  }
  const target = inside !== null ? newFrom + inside : newFrom + 1;
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(target, tr.doc.content.size))));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

// Moves the part to where unit `to` (of its own container) is.
export function movePartTo(view: EditorView, at: PartAt, to: number): boolean {
  const { units, mine } = unitsOf(at);
  if (to === mine || to < 0 || to >= units.length) return false;
  return movePartToSlot(view, at, at.parentPos, to < mine ? units[to].from : units[to].to);
}

export const movePart = (view: EditorView, at: PartAt, by: -1 | 1): boolean => movePartTo(view, at, unitsOf(at).mine + by);

// What a group is called in "Move to ▸": a list of pros and cons by its side (and its option, in an
// options block), anything else by its first line (a comparison side's title, a column's heading, a
// key step's question). Names that repeat ("Then", "Then") get their number.
export function groupNames(doc: PMNode, at: PartAt, groups: { pos: number; node: PMNode }[]): string[] {
  const nameOf = (pos: number, n: PMNode): string => {
    if (n.type.name === 'prosConsList') {
      const argument = at.block.type.name === 'argument';
      const con = n.attrs.side === 'con';
      const side = n.attrs.side === 'neutral' ? LABELS.noteBlocks.argument.neutral
        : argument ? (con ? LABELS.noteBlocks.argument.against : LABELS.noteBlocks.argument.for) : (con ? LABELS.noteBlocks.prosCons.cons : LABELS.noteBlocks.prosCons.pros);
      const parent = doc.resolve(pos).parent;
      return parent.type.name === 'optionsItem' ? `${parent.child(0).textContent.trim() || LABELS.noteBlocks.parts.untitled}: ${side}` : side;
    }
    const first = n.firstChild;
    return (first?.isTextblock ? first.textContent.trim() : '') || LABELS.noteBlocks.parts.untitled;
  };
  const all = [...groups, { pos: at.parentPos, node: at.parent }].sort((a, b) => a.pos - b.pos);
  const allNames = all.map((g) => nameOf(g.pos, g.node));
  return groups.map((g) => {
    const i = all.findIndex((x) => x.pos === g.pos);
    return allNames.filter((x) => x === allNames[i]).length > 1 ? `${allNames[i]} (${i + 1})` : allNames[i];
  });
}

// A copy keeps everything but the lasting ids (a passage's id is never in two places).
function copyOf(n: PMNode): PMNode {
  if (n.isText) return n;
  const attrs = 'blockId' in n.attrs ? { ...n.attrs, blockId: null } : n.attrs;
  return n.type.create(attrs, Fragment.from(childrenOf(n).map(copyOf)), n.marks);
}

export function duplicatePart(view: EditorView, at: PartAt): boolean {
  if (!canDuplicatePart(at)) return false;
  const { units, mine } = unitsOf(at);
  const u = units[mine];
  const kids = childrenOf(at.parent);
  const copies = kids.slice(u.from, u.to).map(copyOf);
  if (!at.parent.type.validContent(Fragment.from([...kids.slice(0, u.to), ...copies, ...kids.slice(u.to)]))) return false;
  const insertPos = childPos(at, u.to);
  const tr = view.state.tr.insert(insertPos, copies);
  const { from: sel } = view.state.selection;
  const unitFrom = childPos(at, u.from);
  const offset = sel > unitFrom && sel < insertPos ? sel - unitFrom : 1;
  tr.setSelection(Selection.near(tr.doc.resolve(insertPos + offset)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export const canAddPart = (at: PartAt): boolean => PART_SPECS[at.node.type.name].add !== false;

// A new, empty part of the same kind just before or after this one (after a hierarchy item: after
// everything under it), the cursor in it.
export function addPartBeside(view: EditorView, at: PartAt, where: 'before' | 'after'): boolean {
  if (!canAddPart(at)) return false;
  const keep = Object.fromEntries((PART_SPECS[at.node.type.name].keep ?? []).map((k) => [k, at.node.attrs[k]]));
  const fresh = at.node.type.createAndFill(keep);
  if (!fresh) return false;
  const { units, mine } = unitsOf(at);
  const index = where === 'before' ? units[mine].from : units[mine].to;
  const kids = childrenOf(at.parent);
  if (!at.parent.type.validContent(Fragment.from([...kids.slice(0, index), fresh, ...kids.slice(index)]))) return false;
  const insertPos = childPos(at, index);
  const tr = view.state.tr.insert(insertPos, fresh);
  tr.setSelection(Selection.near(tr.doc.resolve(insertPos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function canDeletePart(at: PartAt): boolean {
  const { units, mine } = unitsOf(at);
  const u = units[mine];
  const kids = childrenOf(at.parent);
  return at.parent.type.validContent(Fragment.from([...kids.slice(0, u.from), ...kids.slice(u.to)]));
}

export function deleteBlockPart(view: EditorView, at: PartAt): void {
  const spec = PART_SPECS[at.node.type.name];
  if (!canDeletePart(at)) { void alertDialog(LABELS.noteBlocks.picked.tooFew); return; }
  if (spec.remove) { spec.remove(view, at); return; }
  const { units, mine } = unitsOf(at);
  const from = childPos(at, units[mine].from);
  const tr = view.state.tr.delete(from, childPos(at, units[mine].to));
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1)).scrollIntoView());
  view.focus();
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const atCursor = (state: EditorState) => (state.selection instanceof TextSelection ? partAround(state.doc, state.selection.from) : null);

export const BlockParts = Extension.create({
  name: 'blockParts',
  // Above DuplicateLine, whose Alt+Shift+↓ copies a line: inside a part, the part is the line.
  priority: 1100,

  addKeyboardShortcuts() {
    const view = () => this.editor.view;
    const move = (by: -1 | 1) => () => {
      const at = atCursor(view().state);
      if (!at || !canMovePart(at)) return false;
      movePart(view(), at, by);
      return true;
    };
    return {
      'Alt-ArrowUp': move(-1),
      'Alt-ArrowDown': move(1),
      'Alt-Shift-ArrowDown': () => {
        const at = atCursor(view().state);
        return !!at && canDuplicatePart(at) && duplicatePart(view(), at);
      },
      'Mod-Shift-Backspace': () => {
        const at = atCursor(view().state);
        if (!at) return false;
        deleteBlockPart(view(), at);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    // The part being dragged, faded where it is until it's dropped (a decoration: ProseMirror would
    // undo a style set on its own nodes).
    return [new Plugin<number[]>({
      key: draggedKey,
      state: {
        init: () => [],
        apply: (tr, v) => (tr.getMeta(draggedKey) as number[] | undefined) ?? (v.length && tr.docChanged ? v.map((p) => tr.mapping.map(p)) : v),
      },
      props: {
        decorations: (state) => {
          const ps = draggedKey.getState(state) ?? [];
          if (!ps.length) return null;
          return DecorationSet.create(state.doc, ps.flatMap((p) => {
            const n = state.doc.nodeAt(p);
            return n ? [Decoration.node(p, p + n.nodeSize, { 'data-part-dragged': '' })] : [];
          }));
        },
      },
      view: (v) => new PartGrip(v),
    })];
  },
});

// ── The grip ─────────────────────────────────────────────────────────────────

const GRIP_SVG = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">'
  + [3, 8, 13].flatMap((y) => [`<circle cx="3" cy="${y}" r="1.4" fill="currentColor"/>`, `<circle cx="7" cy="${y}" r="1.4" fill="currentColor"/>`]).join('')
  + '</svg>';
const touchOnly = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
const nounOf = (at: PartAt) => LABELS.noteBlocks.parts.nouns[at.node.type.name] ?? 'part';

const draggedKey = new PluginKey<number[]>('blockPartDragged');

function unitRect(view: EditorView, at: PartAt, u: Unit): DOMRect | null {
  const dom = view.nodeDOM(childPos(at, u.from));
  return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
}

// Where a part dragged to (x, y) would go: the nearest part in its own container or another group,
// before or after it (by the axis the parts run along), and the line that shows it. Null when that
// is where it already is.
interface DropSlot { container: number; index: number; line: { left: number; top: number; width: number; height: number } }
function dropSlot(view: EditorView, at: PartAt, x: number, y: number): DropSlot | null {
  const { units, mine } = unitsOf(at);
  const containers = [
    { pos: at.parentPos, node: at.parent, units },
    ...otherGroups(at).map((g) => {
      const us: Unit[] = [];
      g.node.forEach((c, _o, i) => { if (c.type === at.node.type) us.push({ from: i, to: i + 1 }); });
      return { pos: g.pos, node: g.node, units: us };
    }),
  ];
  let best: { pos: number; u: Unit; r: DOMRect; inRow: boolean; dist: number } | null = null;
  for (const c of containers) {
    const rects = c.units.map((u) => {
      let p = c.pos + 1;
      for (let i = 0; i < u.from; i++) p += c.node.child(i).nodeSize;
      const dom = view.nodeDOM(p);
      return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
    });
    const inRow = !!rects[0] && !!rects[1] && Math.abs(rects[0].top - rects[1].top) < 6;
    c.units.forEach((u, i) => {
      const r = rects[i];
      if (!r) return;
      const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (!best || dist < best.dist) best = { pos: c.pos, u, r, inRow, dist };
    });
  }
  const b = best as { pos: number; u: Unit; r: DOMRect; inRow: boolean } | null;
  if (!b) return null;
  const before = b.inRow ? x < b.r.left + b.r.width / 2 : y < b.r.top + b.r.height / 2;
  const index = before ? b.u.from : b.u.to;
  if (b.pos === at.parentPos && index >= units[mine].from && index <= units[mine].to) return null;
  const line = b.inRow
    ? { left: (before ? b.r.left - 5 : b.r.right + 2), top: b.r.top, width: 3, height: b.r.height }
    : { left: b.r.left, top: (before ? b.r.top - 5 : b.r.bottom + 2), width: b.r.width, height: 3 };
  return { container: b.pos, index, line };
}

class PartGrip {
  private grip: HTMLButtonElement;
  private drop: HTMLDivElement;
  private target: number | null = null;
  private hideTimer: number | undefined;
  private drag: { x: number; y: number; moved: boolean; slot: DropSlot | null } | null = null;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.grip = document.createElement('button');
    this.grip.type = 'button';
    this.grip.className = popoverClass.partGrip;
    this.grip.setAttribute('data-part-grip', '');
    this.grip.hidden = true;
    this.grip.innerHTML = GRIP_SVG;
    this.drop = document.createElement('div');
    this.drop.className = popoverClass.partDrop;
    this.drop.hidden = true;
    document.body.append(this.grip, this.drop);
    view.dom.addEventListener('mousemove', this.onHover);
    view.dom.addEventListener('mouseleave', this.scheduleHide);
    this.grip.addEventListener('mouseenter', this.cancelHide);
    this.grip.addEventListener('mouseleave', this.scheduleHide);
    this.grip.addEventListener('mousedown', (e) => e.preventDefault());
    this.grip.addEventListener('pointerdown', this.onDown);
    this.grip.addEventListener('pointermove', this.onDrag);
    this.grip.addEventListener('pointerup', this.onUp);
    this.grip.addEventListener('pointercancel', this.endDrag);
    window.addEventListener('scroll', this.onScroll, true);
  }

  update(view: EditorView, prev: EditorState) {
    if (this.drag) return;
    if (touchOnly()) {
      const at = view.hasFocus() && view.editable ? atCursor(view.state) : null;
      if (at) this.show(at); else this.hide();
    } else if (!prev.doc.eq(view.state.doc)) {
      this.hide();
    }
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.onHover);
    this.view.dom.removeEventListener('mouseleave', this.scheduleHide);
    window.removeEventListener('scroll', this.onScroll, true);
    window.clearTimeout(this.hideTimer);
    this.grip.remove();
    this.drop.remove();
  }

  private current(): PartAt | null {
    return this.target === null || this.target > this.view.state.doc.content.size ? null : partAtPos(this.view.state.doc, this.target);
  }

  private onHover = (e: MouseEvent) => {
    if (this.drag || !this.view.editable || touchOnly()) return;
    const c = this.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const at = c ? partAround(this.view.state.doc, c.inside >= 0 ? c.inside : c.pos) : null;
    if (at) { this.cancelHide(); this.show(at); } else this.scheduleHide();
  };

  private show(at: PartAt) {
    const dom = this.view.nodeDOM(at.pos);
    if (!(dom instanceof HTMLElement)) { this.hide(); return; }
    const r = dom.getBoundingClientRect();
    if (!r.width && !r.height) { this.hide(); return; }
    this.target = at.pos;
    // Parts laid out in a row (cards, a flow): the grip sits on the part's top-left corner;
    // parts down the page: just left of the part, by its first line.
    const { units, mine } = unitsOf(at);
    const other = units[mine === 0 ? 1 : mine - 1];
    const or = other ? unitRect(this.view, at, other) : null;
    const inRow = !!or && Math.abs(or.top - r.top) < 6;
    const left = inRow ? r.left - 9 : r.left - 22;
    const top = inRow ? r.top - 11 : r.top + Math.max(0, (Math.min(r.height, 26) - 22) / 2);
    this.grip.style.left = `${Math.max(2, left)}px`;
    this.grip.style.top = `${Math.max(2, top)}px`;
    const label = LABELS.noteBlocks.parts.grip(nounOf(at));
    this.grip.title = label;
    this.grip.setAttribute('aria-label', label);
    this.grip.hidden = false;
  }

  private hide = () => { this.grip.hidden = true; this.target = null; };
  private cancelHide = () => window.clearTimeout(this.hideTimer);
  private scheduleHide = () => {
    if (this.drag || touchOnly()) return;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(this.hide, 250);
  };
  private onScroll = () => { if (!this.drag && !touchOnly()) this.hide(); };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.current()) return;
    e.preventDefault();
    this.grip.setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, moved: false, slot: null };
  };

  private onDrag = (e: PointerEvent) => {
    const d = this.drag;
    const at = this.current();
    if (!d || !at) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    if (!canMovePart(at)) return;
    if (!d.moved) {
      d.moved = true;
      document.documentElement.setAttribute('data-part-dragging', '');
      const { units, mine } = unitsOf(at);
      const faded: number[] = [];
      for (let i = units[mine].from; i < units[mine].to; i++) faded.push(childPos(at, i));
      this.view.dispatch(this.view.state.tr.setMeta(draggedKey, faded));
    }
    d.slot = dropSlot(this.view, at, e.clientX, e.clientY);
    if (d.slot) {
      const { left, top, width, height } = d.slot.line;
      Object.assign(this.drop.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      this.drop.hidden = false;
    } else this.drop.hidden = true;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    const at = this.current();
    this.endDrag();
    if (!d || !at) return;
    if (!d.moved) {
      const dom = this.view.nodeDOM(at.pos);
      const r = this.grip.getBoundingClientRect();
      if (dom instanceof Element) openContextMenuAt(dom, r.left, r.bottom);
      return;
    }
    if (d.slot) movePartToSlot(this.view, at, d.slot.container, d.slot.index);
    e.preventDefault();
  };

  private endDrag = () => {
    if (this.drag?.moved) {
      document.documentElement.removeAttribute('data-part-dragging');
      this.view.dispatch(this.view.state.tr.setMeta(draggedKey, []));
      this.hide();
    }
    this.drag = null;
    this.drop.hidden = true;
  };
}

// ── Right-click ──────────────────────────────────────────────────────────────

function partFromMenu(view: EditorView, target: Element, x: number, y: number): PartAt | null {
  try {
    const at = partAround(view.state.doc, view.posAtDOM(target, 0));
    if (at) return at;
  } catch { /* a widget the editor didn't draw: fall back to the point */ }
  const c = view.posAtCoords({ left: x, top: y });
  return c ? partAround(view.state.doc, c.inside >= 0 ? c.inside : c.pos) : null;
}

registerContextMenuProvider({
  id: 'note-editor.block-part',
  kind: 'note-editor',
  order: 4,
  when: (ctx) => !!ctx.target.closest('[data-note-block]'),
  items: (ctx, scope) => {
    const view = (scope.data as { editor: { view: EditorView } }).editor.view;
    if (!view.editable) return [];
    const at = partFromMenu(view, ctx.target, ctx.x, ctx.y);
    if (!at) return [];
    const L = LABELS.noteBlocks.parts;
    const noun = nounOf(at);
    const spec = PART_SPECS[at.node.type.name];
    const { units, mine } = unitsOf(at);
    const pickable = BLOCK_PART_NODES[at.block.type.name] === at.node.type.name;
    const groups = otherGroups(at);
    return [
      ...(canMovePart(at) ? [
        { id: 'part-up', label: L.moveUp(noun), icon: '↑', shortcut: 'Alt+↑', disabled: mine <= 0, run: () => { movePart(view, at, -1); } },
        { id: 'part-down', label: L.moveDown(noun), icon: '↓', shortcut: 'Alt+↓', disabled: mine >= units.length - 1, run: () => { movePart(view, at, 1); } },
      ] : []),
      ...(groups.length ? [{
        id: 'part-move-to', label: L.moveTo(noun), icon: '⇄',
        submenu: [groupNames(view.state.doc, at, groups).map((name, i) => ({ id: `part-move-to-${i}`, label: name, run: () => { movePartToSlot(view, at, groups[i].pos, groups[i].node.childCount); } }))],
      }] : []),
      ...(canAddPart(at) ? [
        { id: 'part-add-before', label: L.addBefore(noun), icon: '+', run: () => { addPartBeside(view, at, 'before'); } },
        { id: 'part-add-after', label: L.addAfter(noun), icon: '+', run: () => { addPartBeside(view, at, 'after'); } },
      ] : []),
      ...(canDuplicatePart(at) ? [{ id: 'part-duplicate', label: L.duplicate(noun), icon: '⧉', shortcut: 'Alt+Shift+↓', run: () => { duplicatePart(view, at); } }] : []),
      ...(pickable ? [{ id: 'part-select', label: L.select(noun), shortcut: 'Ctrl+click', run: () => { togglePick(view, { block: at.blockPos, part: at.pos }); } }] : []),
      ...(spec.ownMenu ? [] : [{ id: 'part-delete', label: L.delete(noun), icon: createElement(TrashIcon, { width: '1em', height: '1em' }), shortcut: 'Ctrl+Shift+⌫', destructive: true, disabled: !canDeletePart(at), run: () => deleteBlockPart(view, at) }]),
    ];
  },
});

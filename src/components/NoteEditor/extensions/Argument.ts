import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';
import { listDecorations, listWeight, pointAt, pointsEnter, stepField, type ListWords } from './ProsCons';

// An argument (`\argument`, 2026-10-17, agreed with the user): a claim and the case for it, against
// it, or both. Unlike pros and cons, which weighs one thing (should I?), an argument is a position
// someone holds (it is so) and what bears on it: its evidence, why that evidence supports it, and
// who is on which side.
//
//   argument       variant (design: card / tree / debate), sides (for / against / both), hidden
//                  (what a hidden side or part held, so hiding loses nothing), frames
//   argumentClaim  the claim
//   prosConsList   the evidence, side 'pro' (for) and 'con' (against): the pros and cons block's own
//                  lists, so each piece is weighted 1–3 and the keys are the same
//   argumentField  an optional part (field attr): why the evidence supports it, who made it, who
//                  supports it, who's against it, its sources; only the parts in use are in the
//                  document, in ARGUMENT_FIELDS order
//
// "For only", "Against only" and "For and against" are the Sides setting, not designs: a design
// never changes the content (CLAUDE.md "Block designs"), and these hide a list.
// Designs: Card (the claim, then each side under its heading), Tree (the claim with its evidence
// branching beneath it), Debate (the claim across the top, for and against in two columns).

export const ARGUMENT_VARIANTS = ['card', 'tree', 'debate'] as const;
export type ArgumentVariant = typeof ARGUMENT_VARIANTS[number];
export const ARGUMENT_SIDES = ['for', 'against', 'both'] as const;
export type ArgumentSides = typeof ARGUMENT_SIDES[number];
export const ARGUMENT_FIELDS = ['why', 'by', 'supporters', 'opponents', 'sources'] as const;
export type ArgumentField = typeof ARGUMENT_FIELDS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const Argument = Node.create({
  name: 'argument',
  group: 'block',
  content: 'argumentClaim prosConsList+ argumentField*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'card', parseHTML: (el) => oneOf(ARGUMENT_VARIANTS, el.getAttribute('data-variant'), 'card'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      sides:   { default: 'both', parseHTML: (el) => oneOf(ARGUMENT_SIDES, el.getAttribute('data-sides'), 'both'), renderHTML: (a) => ({ 'data-sides': a.sides }) },
      hidden: {
        default: {},
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-hidden') || '{}'); } catch { return {}; } },
        renderHTML: (a) => (Object.keys(a.hidden ?? {}).length ? { 'data-hidden': JSON.stringify(a.hidden) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="argument"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'argument', 'data-note-block': '' }), 0]; },
});

export const ArgumentClaim = Node.create({
  name: 'argumentClaim',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-arg-claim]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-arg-claim': '' }), 0]; },
});

export const ArgumentFieldNode = Node.create({
  name: 'argumentField',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { field: { default: 'why', parseHTML: (el) => oneOf(ARGUMENT_FIELDS, el.getAttribute('data-arg-field'), 'why'), renderHTML: (a) => ({ 'data-arg-field': a.field }) } };
  },
  parseHTML() { return [{ tag: 'div[data-arg-field]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', HTMLAttributes, 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface ArgAt { node: PMNode; pos: number }

function argumentAt($pos: ResolvedPos): ArgAt | null {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'argument') return { node: $pos.node(d), pos: $pos.before(d) };
  return null;
}

export function argumentPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="argument"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'argument' ? pos : null;
  } catch { return null; }
}

export const fieldsOf = (node: PMNode): ArgumentField[] => {
  const out: ArgumentField[] = [];
  node.forEach((c) => { if (c.type.name === 'argumentField') out.push(c.attrs.field as ArgumentField); });
  return out;
};

const listOf = (node: PMNode, side: 'pro' | 'con'): PMNode | null => {
  let found: PMNode | null = null;
  node.forEach((c) => { if (c.type.name === 'prosConsList' && c.attrs.side === side) found = c; });
  return found;
};

// ── Making and changing ──────────────────────────────────────────────────────

const newList = (state: EditorState, side: 'pro' | 'con') =>
  state.schema.nodes.prosConsList.create({ side }, state.schema.nodes.prosConsPoint.create());

export function argumentNode(state: EditorState, claim = ''): PMNode {
  const { argument, argumentClaim } = state.schema.nodes;
  return argument.create(null, [argumentClaim.create(null, claim ? state.schema.text(claim) : null), newList(state, 'pro'), newList(state, 'con')]);
}

// `\argument`: an empty argument in place of what was typed, the cursor in its claim.
export function insertArgument(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.argument) return null;
  const made = replaceTypedWithBlock(state, from, to, argumentNode(state));
  if (!made) return null;
  return made.tr.setSelection(TextSelection.create(made.tr.doc, made.at + 2)).scrollIntoView();
}

export function setArgumentVariant(view: EditorView, pos: number, variant: ArgumentVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'argument') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

type Hidden = Record<string, unknown>;

// Rebuilds the block's children: the claim, the lists for `sides` (a list hidden before comes back
// as it was; a list hidden now is kept in `hidden`), then `fields` in their order. Pure, so the
// sides and parts setters share it.
function rebuild(state: EditorState, node: PMNode, sides: ArgumentSides, fields: ArgumentField[]): { children: PMNode[]; hidden: Hidden } {
  const hidden: Hidden = { ...(node.attrs.hidden as Hidden) };
  const { schema } = state;
  const restore = (key: string): PMNode | null => {
    const json = hidden[key];
    delete hidden[key];
    if (!json) return null;
    try { return PMNode.fromJSON(schema, json as Record<string, unknown>); } catch { return null; }
  };
  const stash = (key: string, n: PMNode | null) => { if (n && n.textContent.trim()) hidden[key] = n.toJSON(); };
  const children: PMNode[] = [node.child(0)];
  for (const [side, key, shown] of [['pro', 'for', sides !== 'against'], ['con', 'against', sides !== 'for']] as const) {
    const now = listOf(node, side);
    if (shown) children.push(now ?? restore(key) ?? newList(state, side));
    else stash(key, now);
  }
  const present = new Map<string, PMNode>();
  node.forEach((c) => { if (c.type.name === 'argumentField') present.set(c.attrs.field as string, c); });
  for (const f of ARGUMENT_FIELDS) {
    const now = present.get(f) ?? null;
    if (fields.includes(f)) children.push(now ?? restore(`field:${f}`) ?? schema.nodes.argumentField.create({ field: f }));
    else stash(`field:${f}`, now);
  }
  return { children, hidden };
}

function applyRebuild(view: EditorView, pos: number, node: PMNode, sides: ArgumentSides, fields: ArgumentField[], focusField?: ArgumentField): void {
  const { children, hidden } = rebuild(view.state, node, sides, fields);
  const next = node.type.create({ ...node.attrs, sides, hidden }, children);
  const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, next);
  if (focusField) {
    let at: number | null = null;
    next.forEach((c, offset) => { if (c.type.name === 'argumentField' && c.attrs.field === focusField) at = pos + 1 + offset + 1 + c.content.size; });
    if (at !== null) tr.setSelection(TextSelection.create(tr.doc, at));
  }
  view.dispatch(tr.scrollIntoView());
}

export function setArgumentSides(view: EditorView, pos: number, sides: ArgumentSides): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'argument' || node.attrs.sides === sides) return;
  applyRebuild(view, pos, node, sides, fieldsOf(node));
}

// Shows a part (the cursor in it) or hides it (its text kept, to come back when shown again).
export function toggleArgumentField(view: EditorView, pos: number, field: ArgumentField): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'argument') return;
  const fields = fieldsOf(node);
  const showing = fields.includes(field);
  applyRebuild(view, pos, node, node.attrs.sides as ArgumentSides, showing ? fields.filter((f) => f !== field) : [...fields, field], showing ? undefined : field);
}

// ── Keys ─────────────────────────────────────────────────────────────────────

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

function leaveBlock(state: EditorState, b: ArgAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const after = b.pos + b.node.nodeSize;
  const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
}

// Enter: from the claim on to the evidence; in the evidence a new piece, or (on an empty last one)
// on to what follows; in a part the next part, and from the last, out of the block.
export const argumentEnter: Command = (state, dispatch) => {
  const b = argumentAt(state.selection.$from);
  if (!b) return false;
  const end = b.pos + b.node.nodeSize;
  const viaPoints = pointsEnter(state, dispatch, end, (tr) => {
    if (!dispatch) return;
    const after = b.pos + b.node.nodeSize - (state.doc.nodeSize - tr.doc.nodeSize);
    tr.insert(after, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  });
  if (viaPoints !== null) return viaPoints;
  const last = b.node.lastChild;
  if (last && state.selection.$from.parent === last && last.type.name === 'argumentField') return leaveBlock(state, b, dispatch);
  return stepField(state, b, 1, dispatch);
};

export const argumentTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const b = argumentAt(state.selection.$from);
  return b ? stepField(state, b, dir, dispatch) : false;
};

// Backspace at the start of a field: an empty argument with the cursor in its claim becomes a plain
// line again; an empty piece of evidence goes (one always stays); anywhere else it steps back a
// field rather than merging two.
export const argumentBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const b = argumentAt($from);
  if (!b) return false;
  if ($from.parent.type.name === 'argumentClaim') {
    if (b.node.textContent.trim() === '' && dispatch) {
      const tr = state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, b.pos + 1)));
    }
    return true;
  }
  const at = pointAt($from);
  if (at && at.point.content.size === 0 && at.list.childCount > 1) {
    if (dispatch) {
      const tr = state.tr.delete(at.pos, at.pos + at.point.nodeSize);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at.pos), -1)).scrollIntoView());
    }
    return true;
  }
  return stepField(state, b, -1, dispatch);
};

export const argumentDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!argumentAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<ArgumentVariant, string> = {
  card:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><path d="M4 5h8M4 8.5h5M4 11h5"/></svg>',
  tree:   '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="1.5" width="6" height="3.5" rx="1"/><path d="M8 5v2.5M3 7.5h10M3 7.5V10M8 7.5V10M13 7.5V10"/><rect x="1.5" y="10" width="3" height="3.5" rx=".8"/><rect x="6.5" y="10" width="3" height="3.5" rx=".8"/><rect x="11.5" y="10" width="3" height="3.5" rx=".8"/></svg>',
  debate: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h13M8 5.5v8.5"/><path d="M2.5 7h3M2.5 10h3M10.5 7h3M10.5 10h3"/></svg>',
};

export const ARGUMENT_DESIGNS: BlockDesign<ArgumentVariant>[] = ARGUMENT_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.argument.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, node: PMNode): HTMLElement {
  const L = LABELS.noteBlocks.argument;
  const attrs = node.attrs;
  const bar = blockPill('data-argument-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  bar.append(designButtons(ARGUMENT_DESIGNS, attrs.variant as ArgumentVariant, (v) => { const p = pos(); if (p !== null) setArgumentVariant(view, p, v); }));
  for (const s of ARGUMENT_SIDES) {
    const b = pillButton(L.sidesTitle(L.sides[s]), () => { const p = pos(); if (p !== null) setArgumentSides(view, p, s); }, L.sides[s]);
    b.setAttribute('data-arg-tool', 'sides');
    b.setAttribute('aria-pressed', String(attrs.sides === s));
    bar.append(b);
  }
  const shown = fieldsOf(node);
  for (const f of ARGUMENT_FIELDS) {
    const b = pillButton(L.fieldToggle(L.fields[f]), () => { const p = pos(); if (p !== null) toggleArgumentField(view, p, f); }, L.fieldShort[f]);
    b.setAttribute('data-arg-tool', 'field');
    b.setAttribute('aria-pressed', String(shown.includes(f)));
    bar.append(b);
  }
  bar.append(frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

const LIST_WORDS = (): ListWords => {
  const L = LABELS.noteBlocks.argument;
  return { pros: L.for, cons: L.against, proPlaceholder: L.forPlaceholder, conPlaceholder: L.againstPlaceholder };
};

function argumentDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.argument;
  const current = argumentAt(state.selection.$from);
  let t = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'argument') return !node.isTextblock;
    const k = t++;
    const editing = current?.pos === pos;
    const pro = listOf(node, 'pro');
    const con = listOf(node, 'con');
    const net = (pro ? listWeight(pro) : 0) - (con ? listWeight(con) : 0);
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      ...(node.attrs.sides === 'both' ? { 'data-arg-lean': net > 0 ? 'for' : net < 0 ? 'against' : 'even', 'data-arg-net': L.net(net) } : {}),
      ...(editing ? { 'data-arg-current': '' } : {}),
    }));
    const a = node.attrs;
    const key = `arg-tools-${k}-${a.variant}-${a.sides}-${fieldsOf(node).join('.')}-${a.outlined ? 'o' : ''}${a.shaded ? 's' : ''}-${a.outlineColor}-${a.shadeColor}-${a.frameShape}-${a.outlineStyle}-${a.outlineWidth}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node), { side: -1, key, ignoreSelection: true, stopEvent: () => true }));
    node.forEach((child, offset, i) => {
      const p = pos + 1 + offset;
      const end = p + child.nodeSize;
      if (child.type.name === 'argumentClaim') {
        if (child.content.size === 0) decos.push(Decoration.node(p, end, { 'data-arg-empty': '', 'data-arg-placeholder': L.claimPlaceholder }));
        decos.push(Decoration.node(p, end, { 'data-arg-kind': L.label }));
      } else if (child.type.name === 'prosConsList') {
        listDecorations(decos, child, p, `arg-${k}-${i}`, LIST_WORDS());
      } else if (child.type.name === 'argumentField') {
        const f = child.attrs.field as ArgumentField;
        const attrs: Record<string, string> = { 'data-arg-label': L.fields[f] };
        if (child.content.size === 0) {
          if (editing) Object.assign(attrs, { 'data-arg-empty': '', 'data-arg-placeholder': L.fieldPlaceholders[f] });
          else attrs['data-arg-hide'] = '';
        }
        decos.push(Decoration.node(p, end, attrs));
      }
    });
    return false;
  });
  return t ? DecorationSet.create(state.doc, decos) : null;
}

const argumentKey = new PluginKey('argument');

export const ArgumentBehaviour = Extension.create({
  name: 'argumentBehaviour',
  // Above the pros and cons block's keys: the lists are shared, and inside an argument these lead.
  priority: 111,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(argumentEnter),
      Tab: run(argumentTab(1)),
      'Shift-Tab': run(argumentTab(-1)),
      Backspace: run(argumentBackspace),
      Delete: run(argumentDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: argumentKey, props: { decorations: argumentDecorations } })];
  },
});

export const ArgumentExtensions = [Argument, ArgumentClaim, ArgumentFieldNode, ArgumentBehaviour];

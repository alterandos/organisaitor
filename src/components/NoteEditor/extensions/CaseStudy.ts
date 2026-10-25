import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteEditorMenuApi } from '../contextMenu';
import { blockFrameAttributes, blockPill, designButtons, designMenuItem, frameButtons, frameMenuItem, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';

// A case study in a note (`\case`, asked for by the user 2026-10-23): a real example that shows a
// principle. Its title, then the parts a case study is written in, each its own line or lines:
//
//   caseStudy   variant: 'card' | 'report' | 'compact'; hidden: what a hidden part held
//   caseTitle   the case's name ("The Montreal Protocol")
//   caseField   one part (field attr, CASE_FIELDS key), in CASE_FIELDS order; only the parts
//               being shown are in the document
//
// The parts: setting (where, when, who), situation, what was done, outcome, what it shows (the
// principle it demonstrates: the reason it's in the note), sources. An empty part shows only while
// the case is being edited. Compact shows the title and what it shows. Keys as the quote's: Enter
// on to the next part and out after the last, Tab / Shift+Tab between parts, Backspace at a part's
// start steps back, Shift+Enter a line break inside a part.

export const CASE_VARIANTS = ['card', 'report', 'compact'] as const;
export type CaseVariant = typeof CASE_VARIANTS[number];

export const CASE_FIELDS = ['setting', 'situation', 'actions', 'outcome', 'shows', 'sources'] as const;
export type CaseField = typeof CASE_FIELDS[number];
export const DEFAULT_CASE_FIELDS: CaseField[] = ['setting', 'situation', 'actions', 'outcome', 'shows'];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

export const CaseStudyBlock = Node.create({
  name: 'caseStudy',
  group: 'block',
  content: 'caseTitle caseField*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'card', parseHTML: (el) => oneOf(CASE_VARIANTS, el.getAttribute('data-variant'), 'card'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      hidden: {
        default: {},
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-hidden') || '{}'); } catch { return {}; } },
        renderHTML: (a) => (Object.keys(a.hidden ?? {}).length ? { 'data-hidden': JSON.stringify(a.hidden) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="case-study"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'case-study', 'data-note-block': '' }), 0]; },
});

export const CaseTitle = Node.create({
  name: 'caseTitle',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-cs-title]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-cs-title': '' }), 0]; },
});

export const CaseFieldNode = Node.create({
  name: 'caseField',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { field: { default: 'situation', parseHTML: (el) => oneOf(CASE_FIELDS, el.getAttribute('data-cs-field'), 'situation'), renderHTML: (a) => ({ 'data-cs-field': a.field }) } };
  },
  parseHTML() { return [{ tag: 'div[data-cs-field]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', HTMLAttributes, 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface CaseAt { node: PMNode; pos: number; part: number }

function caseAt($pos: ResolvedPos): CaseAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'caseStudy') continue;
    return { node: $pos.node(d), pos: $pos.before(d), part: d < $pos.depth ? $pos.index(d) : 0 };
  }
  return null;
}

const partStart = (c: CaseAt, index: number) => {
  let p = c.pos + 1;
  for (let i = 0; i < index; i++) p += c.node.child(i).nodeSize;
  return p;
};

export const fieldsOf = (node: PMNode): CaseField[] => {
  const out: CaseField[] = [];
  node.forEach((child, _o, i) => { if (i > 0) out.push(child.attrs.field as CaseField); });
  return out;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making one ───────────────────────────────────────────────────────────────

export function caseStudyNode(state: EditorState, title = '', fields: CaseField[] = DEFAULT_CASE_FIELDS): PMNode {
  const { caseStudy, caseTitle, caseField } = state.schema.nodes;
  return caseStudy.create(null, [
    caseTitle.create(null, title ? state.schema.text(title) : null),
    ...CASE_FIELDS.filter((f) => fields.includes(f)).map((field) => caseField.create({ field })),
  ]);
}

// `\case`: an empty case study, the cursor in its title.
export function insertCaseStudy(state: EditorState, from: number, to: number): Transaction | null {
  if (!state.schema.nodes.caseStudy) return null;
  const made = replaceTypedWithBlock(state, from, to, caseStudyNode(state));
  if (!made) return null;
  return made.tr.setSelection(TextSelection.create(made.tr.doc, made.at + 2)).scrollIntoView();
}

export function setCaseVariant(view: EditorView, pos: number, variant: CaseVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'caseStudy') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, variant }));
}

// Shows a part (in its place, with what it held when hidden) or hides it (its text kept in `hidden`).
export function toggleCaseField(view: EditorView, pos: number, field: CaseField): void {
  const state = view.state;
  const node = state.doc.nodeAt(pos);
  if (node?.type.name !== 'caseStudy') return;
  const hidden = { ...(node.attrs.hidden as Record<string, unknown>) };
  const tr = state.tr;
  let shownAt = -1;
  for (let i = 1, p = pos + 1 + node.child(0).nodeSize; i < node.childCount; p += node.child(i).nodeSize, i++) {
    if (node.child(i).attrs.field === field) shownAt = p;
  }
  if (shownAt >= 0) {
    const child = state.doc.nodeAt(shownAt)!;
    if (child.content.size) hidden[field] = child.content.toJSON();
    tr.delete(shownAt, shownAt + child.nodeSize);
  } else {
    const order = CASE_FIELDS.indexOf(field);
    let at = pos + 1 + node.child(0).nodeSize;
    node.forEach((child, _o, i) => { if (i > 0 && CASE_FIELDS.indexOf(child.attrs.field) < order) at += child.nodeSize; });
    const kept = hidden[field];
    delete hidden[field];
    let content: PMNode['content'] | null;
    // What it held, back as it was; something that no longer fits the schema comes back empty.
    try { content = kept ? state.schema.nodeFromJSON({ type: 'caseField', attrs: { field }, content: kept }).content : null; } catch { content = null; }
    tr.insert(at, state.schema.nodes.caseField.create({ field }, content));
  }
  tr.setNodeAttribute(pos, 'hidden', hidden);
  view.dispatch(tr);
}

export function casePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="case-study"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'caseStudy' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const toPart = (state: EditorState, c: CaseAt, index: number, dispatch?: (tr: Transaction) => void): boolean => {
  if (dispatch) {
    const start = partStart(c, index);
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, start + 1 + c.node.child(index).content.size)).scrollIntoView());
  }
  return true;
};

const replaceWithParagraph = (state: EditorState, c: CaseAt, dispatch?: (tr: Transaction) => void): boolean => {
  if (dispatch) {
    const tr = state.tr.replaceWith(c.pos, c.pos + c.node.nodeSize, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, c.pos + 1)));
  }
  return true;
};

export const caseEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const c = caseAt($from);
  if (!c || !$from.parent.isTextblock) return false;
  if (c.node.textContent.trim() === '' && c.part === 0) return replaceWithParagraph(state, c, dispatch);
  if (c.part + 1 < c.node.childCount) return toPart(state, c, c.part + 1, dispatch);
  if (dispatch) {
    const after = c.pos + c.node.nodeSize;
    const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  }
  return true;
};

const caseTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const c = caseAt(state.selection.$from);
  if (!c) return false;
  const next = c.part + dir;
  if (next < 0 || next >= c.node.childCount) return true;
  return toPart(state, c, next, dispatch);
};

const caseBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const c = caseAt($from);
  if (!c) return false;
  if (c.part === 0) return c.node.textContent.trim() === '' ? replaceWithParagraph(state, c, dispatch) : true;
  return toPart(state, c, c.part - 1, dispatch);
};

const caseDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!caseAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

// The pill, which case is being edited, and each part's label and placeholder (an empty part
// shows only while the case is being edited; Compact shows only the title and what it shows).
function caseDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.caseStudy;
  const current = caseAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'caseStudy') return !node.isTextblock;
    const t = n++;
    const editing = current?.pos === pos;
    const variant = node.attrs.variant as CaseVariant;
    const shown = fieldsOf(node);
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, variant, shown, node.attrs),
      { side: -1, key: `case-tools-${t}-${variant}-${shown.join(',')}-${node.attrs.outlined ? 'o' : ''}${node.attrs.shaded ? 's' : ''}`, ignoreSelection: true, stopEvent: () => true }));
    // The small kind line ("CASE STUDY") the Card and Report designs and Compact show.
    decos.push(Decoration.node(pos, pos + node.nodeSize, editing ? { 'data-cs-current': '', 'data-cs-kind': L.label } : { 'data-cs-kind': L.label }));
    let p = pos + 1;
    node.forEach((child, _o, i) => {
      const end = p + child.nodeSize;
      const empty = child.content.size === 0;
      if (i === 0) {
        if (empty) decos.push(Decoration.node(p, end, { 'data-cs-empty': '', 'data-cs-placeholder': L.titlePlaceholder }));
      } else {
        const field = child.attrs.field as CaseField;
        const attrs: Record<string, string> = { 'data-cs-label': L.fields[field] };
        if (!editing && (empty || (variant === 'compact' && field !== 'shows'))) attrs['data-cs-hide'] = '';
        if (empty) { attrs['data-cs-empty'] = ''; attrs['data-cs-placeholder'] = L.placeholders[field]; }
        decos.push(Decoration.node(p, end, attrs));
      }
      p = end;
    });
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

const DESIGN_ICONS: Record<CaseVariant, string> = {
  card:    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 2.5v11M4.5 6h6M4.5 9h7M4.5 11.5h4"/></svg>',
  report:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h8M2 4.8h12"/><path d="M2 7.5h3M2 9.5h11M2 11.5h9"/><rect x="2" y="13" width="12" height="1.6" rx=".6"/></svg>',
  compact: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="5.5" width="13" height="5" rx="1.5"/><path d="M4 8h3M9 8h3.5"/></svg>',
};
export const CASE_DESIGNS: BlockDesign<CaseVariant>[] = CASE_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.caseStudy.designs[id], icon: DESIGN_ICONS[id] }));

function toolsWidget(view: EditorView, getPos: () => number | undefined, variant: CaseVariant, shown: CaseField[], attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.caseStudy;
  const bar = blockPill('data-case-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const fields = document.createElement('span');
  fields.setAttribute('data-cs-fields', '');
  for (const f of CASE_FIELDS) {
    const on = shown.includes(f);
    const b = pillButton(on ? L.hideField(L.fields[f]) : L.showField(L.fields[f]), () => { const p = pos(); if (p !== null) toggleCaseField(view, p, f); }, L.short[f]);
    b.setAttribute('data-cs-tool', 'field');
    b.setAttribute('aria-pressed', String(on));
    fields.append(b);
  }
  bar.append(designButtons(CASE_DESIGNS, variant, (v) => { const p = pos(); if (p !== null) setCaseVariant(view, p, v); }), fields, frameButtons(view, getPos, attrs), selectButton(view, getPos));
  return bar;
}

const caseKey = new PluginKey('caseStudy');

export const CaseStudyBehaviour = Extension.create({
  name: 'caseStudyBehaviour',
  priority: 110,
  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return { Enter: run(caseEnter), Tab: run(caseTab(1)), 'Shift-Tab': run(caseTab(-1)), Backspace: run(caseBackspace), Delete: run(caseDelete) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: caseKey, props: { decorations: caseDecorations } })];
  },
});

export const CaseStudyExtensions = [CaseStudyBlock, CaseTitle, CaseFieldNode, CaseStudyBehaviour];

// Right-click on a case study: its design, which parts show, and its frame.
registerContextMenuProvider({
  id: 'note-editor.case-study',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="case-study"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = casePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.caseStudy;
    const shown = fieldsOf(node);
    return [
      designMenuItem(CASE_DESIGNS, node.attrs.variant as CaseVariant, (v) => setCaseVariant(view, pos, v)),
      { id: 'case-fields', label: L.partsMenu, submenu: [CASE_FIELDS.map((f) => ({ id: f, label: L.fields[f], icon: shown.includes(f) ? '✓' : undefined, run: () => toggleCaseField(view, pos, f) }))] },
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

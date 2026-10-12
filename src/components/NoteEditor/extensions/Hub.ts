import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { glossaryEntry } from '@/services/glossary';
import { noteTitleOf, openHubFromMarker, openHubLink, removeLink, setLinkRelation } from '@/services/noteHubs';
import { RELATIONS, isRelation, type HubLinkKind, type HubRelation } from '@/utils/noteHubs';
import {
  blockFrameAttributes, blockPill, designButtons, frameButtons, openBlockPopover, popoverClass as pop,
  replaceTypedWithBlock, selectButton, type BlockDesign,
} from './blockDesigns';

// An idea hub in a note (`\hub`): one bigger idea and what bears on it. A name, your own take on
// it, then links, each saying how it relates (causes, supports, contradicts, an example of…) and
// grouped by that. A link is to a passage of a note (made with Add to hub on selected text; the
// passage stays where it is, marked, with a small marker after it), a Glossary term or a whole
// note (the hub's + Link…). What links do is services/noteHubs.ts.
//
//   hub       hubId, variant (list / compact; a canvas is to come as another design), frames
//   hubTitle  the idea's name           hubTake   your own take on it (one line)
//   hubLink   linkId, relation, kind (passage / glossary / note), noteId + tabId (a passage's
//             note, or the linked note), entryId (a term), label (a passage's preview)
//   hubRef    the mark on a linked passage: hubId, linkId, hubNoteId, hubTitle (data only; its
//             marker is drawn once per passage, never per mark element)

export const HUB_VARIANTS = ['list', 'compact'] as const;
export type HubVariant = typeof HUB_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const str = (attr: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${attr}`) || null,
  renderHTML: (a: Record<string, unknown>) => {
    const key = attr.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    return a[key] ? { [`data-${attr}`]: a[key] } : {};
  },
});

export const Hub = Node.create({
  name: 'hub',
  group: 'block',
  content: 'hubTitle hubTake hubLink*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      hubId:   str('hub-id'),
      variant: { default: 'list', parseHTML: (el) => oneOf(HUB_VARIANTS, el.getAttribute('data-variant'), 'list'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="hub"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'hub', 'data-note-block': '' }), 0]; },
});

export const HubTitle = Node.create({
  name: 'hubTitle',
  content: 'inline*',
  defining: true,
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-hub-title]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-hub-title': '' }), 0]; },
});

export const HubTake = Node.create({
  name: 'hubTake',
  content: 'inline*',
  defining: true,
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-hub-take]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-hub-take': '' }), 0]; },
});

export const HubLink = Node.create({
  name: 'hubLink',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      linkId:   str('link-id'),
      relation: { default: 'related', parseHTML: (el) => oneOf(RELATIONS, el.getAttribute('data-relation'), 'related'), renderHTML: (a) => ({ 'data-relation': a.relation }) },
      kind:     { default: 'passage', parseHTML: (el) => el.getAttribute('data-kind') || 'passage', renderHTML: (a) => ({ 'data-kind': a.kind }) },
      noteId:   str('note-id'),
      tabId:    str('tab-id'),
      entryId:  str('entry-id'),
      label:    { default: '', parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent ?? '', renderHTML: (a) => ({ 'data-label': a.label }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="hub-link"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'hub-link' }), String(node.attrs.label ?? '')];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new HubLinkView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

export const HubRefMark = Mark.create({
  name: 'hubRef',
  inclusive: false,
  excludes: '',   // a passage can be in several hubs

  addAttributes() {
    return { hubId: str('hub-id'), linkId: str('hub-link'), hubNoteId: str('hub-note'), hubTitle: str('hub-title') };
  },

  parseHTML() { return [{ tag: 'span[data-hub-link]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-hub-ref': '' }), 0]; },
});

// ── Making and changing ──────────────────────────────────────────────────────

// `\hub`: replaces from..to (what was typed and the space before it) with an empty hub, the cursor
// in its name.
export function insertHub(state: EditorState, from: number, to: number): Transaction | null {
  const { hub, hubTitle, hubTake } = state.schema.nodes;
  if (!hub) return null;
  const made = replaceTypedWithBlock(state, from, to, hub.create({ hubId: nanoid(10) }, [hubTitle.create(), hubTake.create()]));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function hubPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="hub"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'hub' ? pos : null;
  } catch { return null; }
}

export function linkPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="hub-link"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'hubLink') return p;
    return null;
  } catch { return null; }
}

export function setHubDesign(view: EditorView, pos: number, variant: HubVariant): void {
  if (view.state.doc.nodeAt(pos)?.type.name !== 'hub') return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'variant', variant));
}

// Asks NoteEditor to open + Link… for the hub at `hubPos` (the picker is React, the hub isn't).
export function requestHubLinkPicker(view: EditorView, hubPos: number): void {
  view.dom.dispatchEvent(new CustomEvent('hub-link-picker', { bubbles: true, detail: { hubPos } }));
}

export function openRelationPicker(view: EditorView, linkPos: number, anchor: DOMRect): void {
  const link = view.state.doc.nodeAt(linkPos);
  if (link?.type.name !== 'hubLink') return;
  const L = LABELS.hubs;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const h = document.createElement('div');
    h.className = pop.heading;
    h.textContent = L.relation;
    const row = document.createElement('div');
    row.className = pop.row;
    for (const r of RELATIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = pop.choice;
      b.textContent = L.relations[r].label;
      b.setAttribute('aria-pressed', String(link.attrs.relation === r));
      b.addEventListener('click', () => { setLinkRelation(view, linkPos, r); close(); view.focus(); });
      row.append(b);
    }
    box.append(h, row);
    return box;
  });
}

// ── A link ───────────────────────────────────────────────────────────────────
// What it points at (its icon, its current name: a term's or note's name as it is now, a
// passage's preview), where that is, how it relates, and × to take it out.

class HubLinkView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'hub-link');
    this.dom.contentEditable = 'false';
    this.render();
  }

  private render() {
    const a = this.node.attrs;
    const L = LABELS.hubs;
    const kind = a.kind as HubLinkKind;
    const relation: HubRelation = isRelation(a.relation) ? a.relation : 'related';
    this.dom.setAttribute('data-relation', relation);
    this.dom.setAttribute('data-kind', kind);
    const entry = kind === 'glossary' && a.entryId ? glossaryEntry(a.entryId as string) : null;
    const icon = kind === 'glossary' ? entry?.icon ?? '📖' : kind === 'note' ? ITEM_TYPE_ICON.note : '❝';
    const name = kind === 'glossary' ? entry?.term ?? (a.label as string)
      : kind === 'note' ? noteTitleOf(a.noteId as string | null) ?? (a.label as string)
      : (a.label as string);
    const where = kind === 'glossary' ? entry?.kindLabel ?? L.kinds.glossary
      : kind === 'note' ? L.kinds.note
      : noteTitleOf(a.noteId as string | null) ?? '';

    const iconEl = document.createElement('span');
    iconEl.setAttribute('data-hub-link-icon', '');
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const open = document.createElement('button');
    open.type = 'button';
    open.setAttribute('data-hub-link-open', '');
    open.textContent = name;
    open.title = where ? `${name} · ${where}` : name;
    open.addEventListener('click', (e) => {
      e.preventDefault();
      openHubLink({ kind, noteId: a.noteId as string | null, entryId: a.entryId as string | null, linkId: a.linkId as string });
    });

    const whereEl = document.createElement('span');
    whereEl.setAttribute('data-hub-link-where', '');
    whereEl.textContent = where;

    const rel = document.createElement('button');
    rel.type = 'button';
    rel.setAttribute('data-hub-link-relation', '');
    rel.textContent = L.relations[relation].label;
    rel.title = L.relationTitle;
    rel.disabled = !this.editor.isEditable;
    rel.addEventListener('click', (e) => {
      e.preventDefault();
      const p = this.getPos();
      if (p !== undefined) openRelationPicker(this.editor.view, p, rel.getBoundingClientRect());
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('data-hub-link-remove', '');
    remove.textContent = '×';
    remove.title = L.remove;
    remove.setAttribute('aria-label', L.remove);
    remove.hidden = !this.editor.isEditable;
    remove.addEventListener('click', (e) => {
      e.preventDefault();
      const p = this.getPos();
      if (p !== undefined) removeLink(this.editor.view, p);
    });

    for (const b of [open, rel, remove]) b.addEventListener('mousedown', (e) => e.preventDefault());
    this.dom.replaceChildren(iconEl, open, whereEl, rel, remove);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }
  stopEvent(e: Event) { return !!(e.target as HTMLElement | null)?.closest?.('button'); }
  ignoreMutation() { return true; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

function partAt(state: EditorState): { hub: PMNode; hubPos: number; part: 'title' | 'take' } | null {
  const { $from } = state.selection;
  const d = $from.depth;
  if (d < 2 || $from.node(d - 1).type.name !== 'hub') return null;
  const name = $from.parent.type.name;
  if (name !== 'hubTitle' && name !== 'hubTake') return null;
  return { hub: $from.node(d - 1), hubPos: $from.before(d - 1), part: name === 'hubTitle' ? 'title' : 'take' };
}

// Enter in the name goes to your take; Enter in your take leaves the hub.
export const hubEnter: Command = (state, dispatch) => {
  const p = partAt(state);
  if (!p) return false;
  if (!dispatch) return true;
  if (p.part === 'title') {
    const takeEnd = p.hubPos + 1 + p.hub.child(0).nodeSize + 1 + p.hub.child(1).content.size;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, takeEnd)).scrollIntoView());
    return true;
  }
  const end = p.hubPos + p.hub.nodeSize;
  const after = Selection.findFrom(state.doc.resolve(end), 1, true);
  if (after && after.from <= end + 2) { dispatch(state.tr.setSelection(after).scrollIntoView()); return true; }
  const tr = state.tr.insert(end, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  return true;
};

// Backspace at the start of your take goes back to the name; in an empty name of an empty hub, the
// hub turns back into a line. It never merges the two.
export const hubBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const p = partAt(state);
  if (!p) return false;
  if (p.part === 'take') {
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, p.hubPos + 1 + p.hub.child(0).nodeSize - 1)));
    return true;
  }
  if (p.hub.childCount === 2 && p.hub.textContent === '' && dispatch) {
    const tr = state.tr.replaceWith(p.hubPos, p.hubPos + p.hub.nodeSize, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, p.hubPos + 1)));
  }
  return true;
};

export const hubDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!partAt(state);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<HubVariant, string> = {
  list:    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h6M4 6h9M4 8.5h7M2 11.5h6M4 14h9"/></svg>',
  compact: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="5.5" height="3.5" rx="1.5"/><rect x="8.5" y="3" width="6" height="3.5" rx="1.5"/><rect x="1.5" y="9.5" width="8" height="3.5" rx="1.5"/></svg>',
};

export const HUB_DESIGNS: BlockDesign<HubVariant>[] = HUB_VARIANTS.map((id) => ({ id, label: LABELS.hubs.designs[id], icon: DESIGN_ICONS[id] }));

// The HubIcon of components/Icons, as markup: a passage's marker is plain DOM, not React.
const HUB_MARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="20" r="2"/><path d="M6.5 6.5 9.8 9.8M17.5 6.5l-3.3 3.3M12 15v3"/></svg>';

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const bar = blockPill('data-hub-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  bar.append(
    designButtons(HUB_DESIGNS, attrs.variant as HubVariant, (v) => { const p = pos(); if (p !== null) setHubDesign(view, p, v); }),
    frameButtons(view, getPos, attrs), selectButton(view, getPos),
  );
  return bar;
}

function headingWidget(relation: HubRelation): HTMLElement {
  const h = document.createElement('div');
  h.contentEditable = 'false';
  h.setAttribute('data-hub-heading', relation);
  h.textContent = LABELS.hubs.relations[relation].heading;
  return h;
}

function emptyWidget(): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'false';
  el.setAttribute('data-hub-empty', '');
  el.textContent = LABELS.hubs.empty;
  return el;
}

function linkWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-hub-add', '');
  b.textContent = `+ ${LABELS.hubs.link}`;
  b.title = LABELS.hubs.linkTitle;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p !== undefined && view.editable) requestHubLinkPicker(view, view.state.doc.resolve(p).before());
  });
  return b;
}

function markerWidget(view: EditorView, attrs: { hubId: string; linkId: string; hubNoteId: string; hubTitle: string | null }): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-hub-marker', '');
  const title = LABELS.hubs.inHub(attrs.hubTitle || LABELS.hubs.untitled);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = HUB_MARK_SVG;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); openHubFromMarker(view, attrs); });
  return b;
}

function hubDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.hubs;
  const current = partAt(state);
  // Each linked passage's marker, once, after its last piece of text.
  const passageEnds = new Map<string, { to: number; attrs: Record<string, unknown> }>();
  let hubs = 0;
  state.doc.descendants((node, pos) => {
    if (node.isText) {
      for (const m of node.marks) if (m.type.name === 'hubRef' && m.attrs.linkId) passageEnds.set(m.attrs.linkId as string, { to: pos + node.nodeSize, attrs: m.attrs });
      return false;
    }
    if (node.type.name !== 'hub') return true;
    const i = hubs++;
    const a = node.attrs;
    decos.push(Decoration.node(pos, pos + node.nodeSize, {
      ...(current?.hubPos === pos ? { 'data-hub-current': '' } : {}),
      ...(node.childCount === 2 ? { 'data-hub-none': '' } : {}),
    }));
    const key = `${a.variant}-${a.outlined ? 'o' : ''}${a.shaded ? 's' : ''}-${a.outlineColor}-${a.shadeColor}-${a.frameShape}-${a.outlineStyle}-${a.outlineWidth}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, a), { side: -1, key: `hub-tools-${i}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    const title = node.child(0);
    const take = node.child(1);
    const takePos = pos + 1 + title.nodeSize;
    if (title.content.size === 0) decos.push(Decoration.node(pos + 1, takePos, { 'data-hub-placeholder': L.titlePlaceholder }));
    if (take.content.size === 0) decos.push(Decoration.node(takePos, takePos + take.nodeSize, { 'data-hub-placeholder': L.takePlaceholder }));
    const afterTake = takePos + take.nodeSize;
    if (node.childCount === 2) decos.push(Decoration.widget(afterTake, () => emptyWidget(), { side: -1, key: `hub-empty-${i}`, ignoreSelection: true }));
    let previous: string | null = null;
    node.forEach((child, offset) => {
      if (child.type.name !== 'hubLink') return;
      const relation = child.attrs.relation as HubRelation;
      if (relation !== previous) decos.push(Decoration.widget(pos + 1 + offset, () => headingWidget(relation), { side: -1, key: `hub-heading-${i}-${relation}`, ignoreSelection: true }));
      previous = relation;
    });
    decos.push(Decoration.widget(pos + node.nodeSize - 1, (view, getPos) => linkWidget(view, getPos), { side: 1, key: `hub-add-${i}`, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  for (const [linkId, end] of passageEnds) {
    const attrs = end.attrs as { hubId: string; linkId: string; hubNoteId: string; hubTitle: string | null };
    decos.push(Decoration.widget(end.to, (view) => markerWidget(view, attrs), { side: 1, key: `hub-marker-${linkId}-${attrs.hubTitle ?? ''}`, ignoreSelection: true, stopEvent: () => true }));
  }
  return decos.length ? DecorationSet.create(state.doc, decos) : null;
}

// Every hub and link has an id, unique within the note: a pasted copy gets new ones.
function fixIds(state: EditorState): Transaction | null {
  const seen = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    const key = node.type.name === 'hub' ? 'hubId' : node.type.name === 'hubLink' ? 'linkId' : null;
    if (key) {
      const id = node.attrs[key] as string | null;
      if (!id || seen.has(`${key}:${id}`)) {
        const fresh = nanoid(10);
        tr ??= state.tr;
        tr.setNodeAttribute(pos, key, fresh);
        seen.add(`${key}:${fresh}`);
      } else seen.add(`${key}:${id}`);
    }
    return !node.isTextblock;
  });
  return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
}

const hubKey = new PluginKey('hub');

// Keys, drawing and ids, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const HubBehaviour = Extension.create({
  name: 'hubBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(hubEnter),
      Backspace: run(hubBackspace),
      Delete: run(hubDelete),
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: hubKey,
      props: {
        decorations: hubDecorations,
        // Enter on a selected link follows it.
        handleKeyDown: (view, event) => {
          const sel = view.state.selection;
          if (event.key !== 'Enter' || !(sel instanceof NodeSelection) || sel.node.type.name !== 'hubLink') return false;
          const a = sel.node.attrs;
          openHubLink({ kind: a.kind as HubLinkKind, noteId: a.noteId, entryId: a.entryId, linkId: a.linkId });
          return true;
        },
      },
      appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? fixIds(state) : null),
    })];
  },
});

export const HubExtensions = [Hub, HubTitle, HubTake, HubLink, HubRefMark, HubBehaviour];

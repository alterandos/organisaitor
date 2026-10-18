import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { glossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { LABELS } from '@/config/labels';
import { BUILTIN_TAGS } from '../builtinTags';
import { openBlockPopover, popoverClass } from './blockDesigns';
import { refreshMarginColumns, registerMarginSource } from './MarginColumn';
import { createGlyph } from '@/components/Icons';

// Text that refers to a Glossary entry (a Definition, Concept or Acronym defined somewhere in
// Notes): highlighted in the entry's colour; hovering it shows the term's card. Its icon is in the
// margin column (extensions/MarginColumn.ts; the brace and label beside it were replaced
// 2026-10-17): click it for the card, Go to definition, or Remove the link.
// Made with `\` on a selection (objects/selectionMenu.ts).
//
// The mark is data only. Like linked text (objects/artifactGroups.ts), what it looks like beyond
// a background is drawn once per run of marked text, never per mark element: ProseMirror splits
// a mark into a piece per line and around bold words, so per-element drawing would repeat.

const colorOf = (typeKey: string | null) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey)?.color ?? '#6366f1';

export const ConceptRefMark = Mark.create({
  name: 'conceptRef',
  inclusive: false,

  addAttributes() {
    return {
      entryId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-concept-ref'),
        renderHTML: (attrs) => ({ 'data-concept-ref': attrs.entryId }),
      },
      typeKey: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-concept-type'),
        renderHTML: (attrs) => ({ 'data-concept-type': attrs.typeKey }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-concept-ref]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { style: `--concept-color: ${colorOf(HTMLAttributes['data-concept-type'])}` }), 0];
  },
});

// ── Runs of referring text ───────────────────────────────────────────────────

export interface RefGroup {
  entryId: string;
  typeKey: string | null;
  from:    number;
  to:      number;
}

// Each run of text referring to one entry; a run carries on across bold, line breaks and
// paragraph ends, and stops at unmarked text.
export function collectRefGroups(doc: PMNode): RefGroup[] {
  const groups: RefGroup[] = [];
  let current: RefGroup | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === 'conceptRef');
    if (mark?.attrs.entryId) {
      if (current && current.entryId === mark.attrs.entryId) current.to = pos + node.nodeSize;
      else { current = { entryId: mark.attrs.entryId, typeKey: mark.attrs.typeKey, from: pos, to: pos + node.nodeSize }; groups.push(current); }
    } else if (node.text?.trim()) {
      current = null;
    }
    return false;
  });
  return groups;
}

export const refGroupAt = (doc: PMNode, pos: number) => collectRefGroups(doc).find((g) => pos >= g.from && pos <= g.to) ?? null;

export function linkConceptRef(view: EditorView, from: number, to: number, entry: { id: string; typeKey: string }): void {
  const type = view.state.schema.marks.conceptRef;
  if (!type || from >= to) return;
  view.dispatch(view.state.tr.addMark(from, to, type.create({ entryId: entry.id, typeKey: entry.typeKey })));
}

export function unlinkConceptRef(view: EditorView, group: RefGroup): void {
  view.dispatch(view.state.tr.removeMark(group.from, group.to, view.state.schema.marks.conceptRef));
}

// ── The card on hover, and the margin column ─────────────────────────────────

const conceptKey = new PluginKey<{ hover: number | null }>('conceptRef');

const setHover = (view: EditorView, from: number | null) => {
  if (conceptKey.getState(view.state)?.hover !== from) view.dispatch(view.state.tr.setMeta(conceptKey, { hover: from }));
};

// What a term's card says: the term, its kind, what it means, and where it's defined.
export function entryCardContent(entry: ReturnType<typeof glossaryEntry>): Node[] {
  const L = LABELS.glossary;
  if (!entry) return [document.createTextNode(L.missingDetail)];
  const head = document.createElement('strong');
  head.textContent = entry.term || L.untitled;
  const kind = document.createElement('em');
  kind.textContent = entry.kindLabel;
  const meaning = document.createElement('span');
  meaning.textContent = entry.locked ? L.locked : entry.meaning || L.noMeaning;
  const where = document.createElement('small');
  where.textContent = L.definedIn(entry.noteTitle || L.untitledNote, entry.notebookPath.at(-1));
  where.title = L.definedAt([...entry.notebookPath, entry.noteTitle || L.untitledNote]);
  return [head, kind, meaning, where];
}

// A term's card in a popover, from its icon in the margin column: what it means, Go to the
// definition, and (for linked text) Remove the link.
export function openEntryPopover(view: EditorView, entryId: string, typeKey: string | null, anchor: DOMRect, unlink?: () => void): void {
  const entry = glossaryEntry(entryId);
  const L = LABELS.glossary;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    box.setAttribute('data-concept-popover', '');
    box.style.setProperty('--concept-color', colorOf(typeKey));
    box.append(...entryCardContent(entry));
    const actions = document.createElement('div');
    actions.className = popoverClass.row;
    const button = (text: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = popoverClass.choice;
      b.textContent = text;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { close(); run(); });
      actions.append(b);
    };
    if (entry) button(L.goToDefinition, () => openNotePassage(entry.noteId, definitionPassage(entry.id)));
    if (unlink) button(L.removeLink, () => { unlink(); view.focus(); });
    box.append(actions);
    return box;
  });
}

// Each run of linked text in the margin column: the term's icon, in its kind's colour.
registerMarginSource('glossary-link', (state) => collectRefGroups(state.doc).map((g) => {
  const entry = glossaryEntry(g.entryId);
  const L = LABELS.glossary;
  return {
    key: `glossary-${g.entryId}-${g.from}`,
    from: g.from,
    to: g.to,
    icon: () => document.createTextNode(entry ? (entry.locked ? '🔒' : entry.icon) : '?'),
    color: colorOf(g.typeKey),
    title: entry ? `${entry.term || L.untitled} · ${entry.kindLabel}` : L.missing,
    open: (view, anchor) => openEntryPopover(view, g.entryId, g.typeKey, anchor, () => unlinkConceptRef(view, g)),
  };
}));

const HOVER_SHOW_MS = 350;
const HOVER_HIDE_MS = 250;

// Hovering linked words shows the term's card under them, with a way to its definition.
class ConceptHoverView {
  private view: EditorView;
  private card: HTMLElement | null = null;
  private cardFor: number | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(view: EditorView) {
    this.view = view;
    // A term renamed or a vault unlocked changes what the margin column shows.
    const offEntries = useNoteStore.subscribe((s, p) => { if (s.structuredTagEntries !== p.structuredTagEntries || s.notes !== p.notes) refreshMarginColumns(); });
    const offSecrets = useSecretsVersion.subscribe(() => refreshMarginColumns());
    this.unsubscribe = () => { offEntries(); offSecrets(); };
    view.dom.addEventListener('mouseover', this.onTextOver);
    view.dom.addEventListener('mouseout', this.onTextOut);
  }

  private onTextOver = (e: MouseEvent) => {
    const el = (e.target as Element).closest?.('[data-concept-ref]');
    if (!el) return;
    clearTimeout(this.hideTimer);
    let group: RefGroup | null;
    try { group = refGroupAt(this.view.state.doc, this.view.posAtDOM(el, 0)); } catch { group = null; }
    if (!group || this.cardFor === group.from) return;
    clearTimeout(this.showTimer);
    const g = group;
    this.showTimer = setTimeout(() => this.showCard(g), HOVER_SHOW_MS);
  };

  private onTextOut = (e: MouseEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (this.card?.contains(to) || (to as Element).closest?.('[data-concept-ref]'))) return;
    clearTimeout(this.showTimer);
    this.scheduleHide();
  };

  private scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideCard(), HOVER_HIDE_MS);
  }

  private hideCard() {
    this.card?.remove();
    this.card = null;
    this.cardFor = null;
  }

  private showCard(g: RefGroup) {
    const view = this.view;
    const parent = view.dom.parentElement;
    if (view.isDestroyed || !parent) return;
    this.hideCard();
    const entry = glossaryEntry(g.entryId);
    const card = document.createElement('div');
    card.setAttribute('data-concept-hovercard', '');
    card.style.setProperty('--concept-color', colorOf(g.typeKey));
    card.append(...entryCardContent(entry));
    if (entry) {
      const go = document.createElement('button');
      go.type = 'button';
      go.append(`${LABELS.glossary.goToDefinition} `, createGlyph('open'));
      go.addEventListener('mousedown', (ev) => ev.preventDefault());
      go.addEventListener('click', (ev) => { ev.preventDefault(); this.hideCard(); openNotePassage(entry.noteId, definitionPassage(entry.id)); });
      card.append(go);
    }
    card.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
    card.addEventListener('mouseleave', () => this.scheduleHide());
    parent.append(card);
    // Under the start of the linked text, in the editor's own (unzoomed) pixels.
    try {
      const box = parent.getBoundingClientRect();
      const zoom = parent.offsetWidth ? box.width / parent.offsetWidth || 1 : 1;
      const at = view.coordsAtPos(g.from, 1);
      const left = (at.left - box.left) / zoom;
      const maxLeft = parent.clientWidth - card.offsetWidth - 8;
      card.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
      card.style.top = `${(at.bottom - box.top) / zoom + 6}px`;
    } catch { /* not laid out */ }
    this.card = card;
    this.cardFor = g.from;
  }

  update(view: EditorView) { this.view = view; }

  destroy() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideCard();
    this.view.dom.removeEventListener('mouseover', this.onTextOver);
    this.view.dom.removeEventListener('mouseout', this.onTextOut);
    this.unsubscribe();
  }
}

// The referring text of the hovered run is outlined.
function hoverDecorations(state: EditorState): DecorationSet | null {
  const hover = conceptKey.getState(state)?.hover;
  if (hover === null || hover === undefined) return null;
  const group = refGroupAt(state.doc, hover);
  if (!group) return null;
  return DecorationSet.create(state.doc, [Decoration.inline(group.from, group.to, { 'data-concept-hover': '' })]);
}

export const ConceptMargin = Extension.create({
  name: 'conceptMargin',

  addProseMirrorPlugins() {
    return [new Plugin<{ hover: number | null }>({
      key: conceptKey,
      state: {
        init: () => ({ hover: null }),
        apply: (tr, value) => {
          const meta = tr.getMeta(conceptKey) as { hover: number | null } | undefined;
          if (meta) return meta;
          return value.hover !== null && tr.docChanged ? { hover: null } : value;
        },
      },
      view: (view) => new ConceptHoverView(view),
      props: {
        decorations: hoverDecorations,
        handleDOMEvents: {
          mouseover: (view, event) => {
            const el = (event.target as HTMLElement).closest?.('[data-concept-ref]');
            if (!el) { setHover(view, null); return false; }
            try {
              const group = refGroupAt(view.state.doc, view.posAtDOM(el, 0));
              setHover(view, group?.from ?? null);
            } catch { /* not in the document */ }
            return false;
          },
        },
      },
    })];
  },
});

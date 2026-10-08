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

// Text that refers to a Glossary entry (a Definition, Concept or Acronym defined somewhere in
// Notes): highlighted in the entry's colour, with a brace in the margin beside it pointing at a
// label naming the entry. Hover the label for the meaning; click it to go to where it's defined.
// Made with `\` on a selection (objects/selectionMenu.ts).
//
// The mark is data only. Like linked text (objects/artifactGroups.ts), what it looks like beyond
// a background is drawn once per run of marked text, never per mark element: ProseMirror splits
// a mark into a piece per line and around bold words, so per-element drawing would repeat. The
// braces and labels live in a layer beside the editor, measured from the text's positions.

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

// ── The margin ───────────────────────────────────────────────────────────────

const conceptKey = new PluginKey<{ hover: number | null }>('conceptRef');
const WIDE_MIN = 680;      // narrower than this, the margin shows only each label's icon
const LABEL_H = 24;
const LABEL_GAP = 6;

const setHover = (view: EditorView, from: number | null) => {
  if (conceptKey.getState(view.state)?.hover !== from) view.dispatch(view.state.tr.setMeta(conceptKey, { hover: from }));
};

const SVG = 'http://www.w3.org/2000/svg';

// What a term's card says: the term, its kind, what it means, and where it's defined.
function cardContent(entry: ReturnType<typeof glossaryEntry>): Node[] {
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

const HOVER_SHOW_MS = 350;
const HOVER_HIDE_MS = 250;

// A right-facing brace of height h and width w, its tip at (w, h/2).
function bracePath(w: number, h: number): string {
  const r = Math.min(5, h / 4);
  const m = h / 2;
  const x = w / 2;
  return `M0,0 Q${x},0 ${x},${r} L${x},${m - r} Q${x},${m} ${w},${m} Q${x},${m} ${x},${m + r} L${x},${h - r} Q${x},${h} 0,${h}`;
}

class ConceptMarginView {
  private layer: HTMLDivElement;
  private frame = 0;
  private labels = new Map<number, HTMLElement>();
  private observer: ResizeObserver | null = null;
  private unsubscribe: () => void;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.layer = document.createElement('div');
    this.layer.setAttribute('data-concept-margin-layer', '');
    view.dom.parentElement?.appendChild(this.layer);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule());
    this.observer?.observe(view.dom);
    const offEntries = useNoteStore.subscribe((s, p) => { if (s.structuredTagEntries !== p.structuredTagEntries || s.notes !== p.notes) this.schedule(); });
    const offSecrets = useSecretsVersion.subscribe(() => this.schedule());
    this.unsubscribe = () => { offEntries(); offSecrets(); };
    view.dom.addEventListener('mouseover', this.onTextOver);
    view.dom.addEventListener('mouseout', this.onTextOut);
    this.schedule();
  }

  // ── The card on the linked text: hover a linked word for its meaning, and a way to its definition.
  private card: HTMLElement | null = null;
  private cardFor: number | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

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
    card.append(...cardContent(entry));
    if (entry) {
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = `${LABELS.glossary.goToDefinition} ↗`;
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

  update(view: EditorView, prev: EditorState) {
    this.view = view;
    if (view.state.doc !== prev.doc) this.schedule();
    this.showHover();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideCard();
    this.view.dom.removeEventListener('mouseover', this.onTextOver);
    this.view.dom.removeEventListener('mouseout', this.onTextOut);
    this.observer?.disconnect();
    this.unsubscribe();
    this.layer.remove();
    delete (this.view.dom as HTMLElement).dataset.conceptMargin;
  }

  private schedule() {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  private showHover() {
    const hover = conceptKey.getState(this.view.state)?.hover ?? null;
    for (const [from, el] of this.labels) el.toggleAttribute('data-hover', from === hover);
  }

  private draw() {
    const view = this.view;
    if (view.isDestroyed) return;
    const dom = view.dom as HTMLElement;
    const groups = collectRefGroups(view.state.doc);
    this.labels.clear();
    if (groups.length === 0) {
      this.layer.replaceChildren();
      delete dom.dataset.conceptMargin;
      return;
    }
    const mode = dom.clientWidth >= WIDE_MIN ? 'wide' : 'compact';
    if (dom.dataset.conceptMargin !== mode) dom.dataset.conceptMargin = mode;

    // Layout positions, in the layer's own (unzoomed) pixels: the editor may be CSS-zoomed.
    const layerRect = this.layer.getBoundingClientRect();
    const zoom = this.layer.offsetWidth ? layerRect.width / this.layer.offsetWidth || 1 : 1;
    const domRect = dom.getBoundingClientRect();
    const textRight = (domRect.left - layerRect.left) / zoom + dom.clientWidth - parseFloat(getComputedStyle(dom).paddingRight || '0');
    const braceX = textRight + 8;
    const labelX = braceX + 18;

    const out = document.createDocumentFragment();
    let nextFree = -Infinity;
    for (const g of groups) {
      let top: number;
      let bottom: number;
      try {
        top = (view.coordsAtPos(g.from, 1).top - layerRect.top) / zoom;
        bottom = (view.coordsAtPos(g.to, -1).bottom - layerRect.top) / zoom;
      } catch { continue; }
      const h = Math.max(bottom - top, 14);
      const mid = top + h / 2;
      const labelTop = Math.max(mid - LABEL_H / 2, nextFree);
      nextFree = labelTop + LABEL_H + LABEL_GAP;
      const color = colorOf(g.typeKey);

      // The brace, and a leader from its tip to the label when the label had to move down.
      const svgTop = Math.min(top, labelTop);
      const svgBottom = Math.max(top + h, labelTop + LABEL_H);
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('data-concept-brace', '');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', String(svgBottom - svgTop));
      svg.style.cssText = `left: ${braceX}px; top: ${svgTop}px; --concept-color: ${color}`;
      const brace = document.createElementNS(SVG, 'path');
      brace.setAttribute('d', bracePath(10, h));
      brace.setAttribute('transform', `translate(0 ${top - svgTop})`);
      svg.append(brace);
      const labelMid = labelTop + LABEL_H / 2;
      if (Math.abs(labelMid - mid) > 2) {
        const leader = document.createElementNS(SVG, 'path');
        leader.setAttribute('d', `M10,${mid - svgTop} C15,${mid - svgTop} 13,${labelMid - svgTop} 18,${labelMid - svgTop}`);
        svg.append(leader);
      }
      out.append(svg);

      const label = this.makeLabel(g, color, mode);
      label.style.left = `${labelX}px`;
      label.style.top = `${labelTop}px`;
      this.labels.set(g.from, label);
      out.append(label);
    }
    this.layer.replaceChildren(out);
    this.showHover();
  }

  private makeLabel(g: RefGroup, color: string, mode: 'wide' | 'compact'): HTMLElement {
    const L = LABELS.glossary;
    const entry = glossaryEntry(g.entryId);
    const label = document.createElement('button');
    label.type = 'button';
    label.setAttribute('data-concept-label', mode);
    label.style.setProperty('--concept-color', color);
    const icon = document.createElement('span');
    icon.setAttribute('data-concept-icon', '');
    icon.textContent = entry ? (entry.locked ? '🔒' : entry.icon) : '?';
    label.append(icon);
    if (mode === 'wide') {
      const term = document.createElement('span');
      term.setAttribute('data-concept-term', '');
      term.textContent = entry ? entry.term || L.untitled : L.missing;
      label.append(term);
    }
    // The card: the meaning, on hover.
    const card = document.createElement('span');
    card.setAttribute('data-concept-card', '');
    card.append(...cardContent(entry));
    label.append(card);
    label.title = '';
    label.addEventListener('mousedown', (e) => e.preventDefault());
    label.addEventListener('mouseenter', () => setHover(this.view, g.from));
    label.addEventListener('mouseleave', () => setHover(this.view, null));
    label.addEventListener('click', (e) => {
      e.preventDefault();
      if (entry) openNotePassage(entry.noteId, definitionPassage(entry.id));
    });
    return label;
  }
}

// The referring text of the hovered run (from either side: its text or its label) is outlined.
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
      view: (view) => new ConceptMarginView(view),
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

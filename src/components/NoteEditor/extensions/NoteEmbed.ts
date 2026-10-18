import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { DOMSerializer, Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { LABELS } from '@/config/labels';
import { linkTarget, openNoteLink } from '@/services/noteLinkTargets';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, placeBlock, selectButton, typeIntoBlockPlugin, type BlockDesign } from './blockDesigns';
import styles from './NoteLink.module.css';
import { createGlyph } from '@/components/Icons';

// A passage from another note (or this one), shown as it reads now (`\embed`): the block holds
// only where the passage is (note, tab, blockId); its text is read from that note each time it's
// drawn, and redrawn when that note changes. It can't be edited here; "Copy as text here" turns it
// into an ordinary copy that no longer follows the source. Agreed with the user 2026-10-13.

export const EMBED_VARIANTS = ['quote', 'card', 'plain'] as const;
export type EmbedVariant = typeof EMBED_VARIANTS[number];

export const EMBED_DESIGNS: BlockDesign<EmbedVariant>[] = [
  { id: 'quote', label: LABELS.noteLinks.embedDesigns.quote, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3v10"/><path d="M6 5h7M6 8h7M6 11h5"/></svg>' },
  { id: 'card',  label: LABELS.noteLinks.embedDesigns.card,  icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 5.5h4M4.5 8.5h7M4.5 11h5"/></svg>' },
  { id: 'plain', label: LABELS.noteLinks.embedDesigns.plain, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 7h10M3 10h7"/><path d="M10 13h3" stroke-dasharray="1 1"/></svg>' },
];

const oneOf = (v: string | null): EmbedVariant => ((EMBED_VARIANTS as readonly string[]).includes(v ?? '') ? (v as EmbedVariant) : 'quote');

export const NoteEmbed = Node.create({
  name: 'noteEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      variant: { default: 'quote', parseHTML: (el) => oneOf(el.getAttribute('data-variant')), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      noteId:  { default: null, parseHTML: (el) => el.getAttribute('data-embed-note'), renderHTML: (a) => ({ 'data-embed-note': a.noteId }) },
      tabId:   { default: null, parseHTML: (el) => el.getAttribute('data-embed-tab'), renderHTML: (a) => (a.tabId ? { 'data-embed-tab': a.tabId } : {}) },
      blockId: { default: null, parseHTML: (el) => el.getAttribute('data-embed-block'), renderHTML: (a) => (a.blockId ? { 'data-embed-block': a.blockId } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="note-embed"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'note-embed', 'data-note-block': '' })]; },

  addNodeView() {
    return ({ node, editor, getPos }) => new EmbedView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

export interface EmbedTarget { noteId: string; tabId: string | null; blockId: string | null }

// Puts an embed at `at` (an empty line becomes it; else it goes after the line), selected.
export function insertEmbedAt(state: EditorState, at: number, target: EmbedTarget): Transaction | null {
  const type = state.schema.nodes.noteEmbed;
  if (!type) return null;
  const node = type.create({ ...target });
  const tr = state.tr;
  const pos = placeBlock(tr, Math.min(at, state.doc.content.size), node);
  if (pos === null) return null;
  return tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView();
}

// Replaces the embed at `pos` with a copy of what it shows (which then no longer follows the source).
export function copyEmbedAsText(editor: Editor, pos: number): void {
  const view = editor.view;
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'noteEmbed') return;
  const target = linkTarget(node.attrs.noteId, node.attrs.tabId, node.attrs.blockId, view.state.schema);
  if (target.state !== 'ok' || target.fragment.length === 0) return;
  view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, Fragment.from(target.fragment.map((n) => n.type.name === 'paragraph' || n.type.name === 'heading' ? n.type.create({ ...n.attrs, blockId: null }, n.content, n.marks) : n))));
}

// ── The view ─────────────────────────────────────────────────────────────────

const liveViews = new Set<EmbedView>();
let unsubscribe: (() => void) | null = null;

function watchNotes(v: EmbedView) {
  liveViews.add(v);
  if (!unsubscribe) unsubscribe = useNoteStore.subscribe((s, prev) => { if (s.notes !== prev.notes) liveViews.forEach((x) => x.refresh()); });
}
function unwatch(v: EmbedView) {
  liveViews.delete(v);
  if (liveViews.size === 0 && unsubscribe) { unsubscribe(); unsubscribe = null; }
}

class EmbedView {
  dom: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private body: HTMLElement;
  private source: HTMLButtonElement;
  private lastHtml = '';

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'note-embed');
    this.dom.setAttribute('data-note-block', '');
    this.dom.className = styles.embed;
    this.dom.contentEditable = 'false';
    this.pill = document.createElement('div');
    this.body = document.createElement('div');
    this.body.className = styles.embedBody;
    this.source = document.createElement('button');
    this.source.type = 'button';
    this.source.className = styles.embedSource;
    this.source.title = LABELS.noteLinks.embedOpen;
    this.source.addEventListener('click', () => openNoteLink(this.node.attrs.noteId, this.node.attrs.tabId, this.node.attrs.blockId));
    this.dom.append(this.pill, this.body, this.source);
    this.renderChrome();
    this.refresh();
    watchNotes(this);
  }

  private pillPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };

  private renderChrome() {
    const a = this.node.attrs;
    this.dom.setAttribute('data-variant', a.variant as string);
    applyFrameAttrs(this.dom, a);
    const view = this.editor.view;
    const getPos = this.pillPos;
    const set = (variant: EmbedVariant) => {
      const p = this.getPos();
      if (p !== undefined && view.editable) view.dispatch(view.state.tr.setNodeMarkup(p, undefined, { ...this.node.attrs, variant }));
    };
    const bar = blockPill('data-embed-tools');
    const copy = pillButton(LABELS.noteLinks.embedCopyTitle, () => { const p = this.getPos(); if (p !== undefined && view.editable) copyEmbedAsText(this.editor, p); }, LABELS.noteLinks.embedCopy);
    bar.append(designButtons(EMBED_DESIGNS, a.variant as EmbedVariant, set), copy, frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
  }

  // Redraws the passage when it reads differently from what's showing.
  refresh() {
    const a = this.node.attrs;
    const view = this.editor.view;
    if (view.isDestroyed) return;
    const target = linkTarget(a.noteId, a.tabId, a.blockId, view.state.schema);
    const L = LABELS.noteLinks;
    const holder = document.createElement('div');
    if (target.state === 'ok' && target.fragment.length) holder.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(Fragment.from(target.fragment)));
    else holder.textContent = target.state === 'missing-note' ? L.missingNote : target.state === 'missing-passage' ? L.missingPassage : target.state === 'locked' ? L.locked : L.empty;
    const html = `${target.state}|${holder.innerHTML}`;
    this.source.replaceChildren(createGlyph('open'), ` ${L.embedFrom(`${target.title || LABELS.mobileNotes.untitled}${target.heading ? ` › ${target.heading}` : ''}`)}`);
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.body.classList.toggle(styles.previewEmpty, target.state !== 'ok' || target.fragment.length === 0);
    this.body.replaceChildren(...Array.from(holder.childNodes));
  }

  update(node: PMNode) {
    if (node.type.name !== 'noteEmbed') return false;
    const moved = node.attrs.noteId !== this.node.attrs.noteId || node.attrs.blockId !== this.node.attrs.blockId || node.attrs.tabId !== this.node.attrs.tabId;
    this.node = node;
    this.renderChrome();
    if (moved) { this.lastHtml = ''; }
    this.refresh();
    return true;
  }

  stopEvent(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (!!t.closest('[data-embed-tools]') || this.source.contains(t));
  }

  ignoreMutation() { return true; }

  destroy() { unwatch(this); }
}

// An embed from the open note itself follows its own typing too, not only what's been saved.
export const NoteEmbedBehaviour = Extension.create({
  name: 'noteEmbedBehaviour',
  priority: 110,
  addProseMirrorPlugins() {
    let frame = 0;
    return [
      typeIntoBlockPlugin(['noteEmbed'], () => {}),
      new Plugin({
        key: new PluginKey('noteEmbedLive'),
        view: () => ({
          update: (view, prev) => {
            if (view.state.doc.eq(prev.doc) || liveViews.size === 0) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => liveViews.forEach((v) => v.refresh()));
          },
          destroy: () => cancelAnimationFrame(frame),
        }),
      }),
    ];
  },
});

export const NoteEmbedExtensions = [NoteEmbed, NoteEmbedBehaviour];

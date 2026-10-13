import { Extension, Mark, getMarkRange, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { DOMSerializer, Fragment } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { linkTarget, openNoteLink } from '@/services/noteLinkTargets';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import styles from './NoteLink.module.css';

// A link from text to another note, or to one passage of it (a paragraph, or a heading and its
// section): the `noteLink` mark, made with `[[`, `\ref` or "Link to a note…" on a selection (not
// Ctrl+L, which is a web link). A plain click opens the note at the passage, Ctrl/Cmd+click selects
// the linked text (as for web links); hovering shows the passage as it reads now. Agreed with the
// user 2026-10-13.

export const NoteLinkMark = Mark.create({
  name: 'noteLink',
  inclusive: false,
  priority: 1001,   // above the web link, so the two never nest the wrong way round

  addAttributes() {
    return {
      noteId:  { default: null, parseHTML: (el) => el.getAttribute('data-note-link'), renderHTML: (a) => ({ 'data-note-link': a.noteId }) },
      tabId:   { default: null, parseHTML: (el) => el.getAttribute('data-note-tab'), renderHTML: (a) => (a.tabId ? { 'data-note-tab': a.tabId } : {}) },
      blockId: { default: null, parseHTML: (el) => el.getAttribute('data-note-block-id'), renderHTML: (a) => (a.blockId ? { 'data-note-block-id': a.blockId } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'a[data-note-link]' }]; },
  renderHTML({ HTMLAttributes }) { return ['a', mergeAttributes(HTMLAttributes, { class: styles.link }), 0]; },
});

export interface NoteLinkTarget { noteId: string; tabId: string | null; blockId: string | null; name: string }

// Links from..to to the target; with nothing selected (from === to) the target's name goes in as
// the linked text, and typing carries on unlinked after it.
export function applyNoteLink(view: EditorView, from: number, to: number, target: NoteLinkTarget): void {
  const type = view.state.schema.marks.noteLink;
  if (!type) return;
  const size = view.state.doc.content.size;
  from = Math.min(from, size);
  to = Math.min(Math.max(to, from), size);
  const mark = type.create({ noteId: target.noteId, tabId: target.tabId, blockId: target.blockId });
  const tr = view.state.tr;
  if (from < to) {
    tr.removeMark(from, to, type).addMark(from, to, mark);
  } else {
    const name = target.name.trim() || LABELS.mobileNotes.untitled;
    tr.insert(from, view.state.schema.text(name, [...view.state.doc.resolve(from).marks().filter((m) => m.type !== type), mark]));
    tr.setSelection(TextSelection.create(tr.doc, from + name.length)).removeStoredMark(type);
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// The linked text around `pos` stops being a link (its words stay).
export function unlinkNoteLinkAt(view: EditorView, pos: number): void {
  const type = view.state.schema.marks.noteLink;
  const range = type ? getMarkRange(view.state.doc.resolve(pos), type) : null;
  if (range) view.dispatch(view.state.tr.removeMark(range.from, range.to, type));
}

const attrsOf = (el: HTMLElement) => ({
  noteId:  el.getAttribute('data-note-link') ?? '',
  tabId:   el.getAttribute('data-note-tab'),
  blockId: el.getAttribute('data-note-block-id'),
});

// ── The hover card: the passage as it reads now ──────────────────────────────

const SHOW_MS = 350;
const HIDE_MS = 200;

class LinkPreview {
  private card: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private unregisterEscape: (() => void) | null = null;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    view.dom.addEventListener('mouseover', this.over);
    view.dom.addEventListener('mouseout', this.out);
  }

  private over = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.('a[data-note-link]') as HTMLElement | null;
    if (!el) return;
    this.clearHide();
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.show(el), SHOW_MS);
  };

  private out = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest?.('a[data-note-link]')) return;
    if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
    this.scheduleHide();
  };

  private clearHide() { if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } }
  private scheduleHide() { this.clearHide(); this.hideTimer = setTimeout(() => this.hide(), HIDE_MS); }

  private show(el: HTMLElement) {
    if (!el.isConnected) return;
    this.hide();
    const { noteId, tabId, blockId } = attrsOf(el);
    const target = linkTarget(noteId, tabId, blockId, this.view.state.schema);
    const L = LABELS.noteLinks;
    const card = document.createElement('div');
    card.className = styles.preview;
    card.setAttribute('role', 'tooltip');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = styles.previewTitle;
    head.textContent = `${target.title || LABELS.mobileNotes.untitled}${target.heading ? ` › ${target.heading}` : ''}`;
    head.title = L.open;
    head.addEventListener('click', () => { this.hide(); openNoteLink(noteId, tabId, blockId); });
    card.append(head);
    const body = document.createElement('div');
    body.className = styles.previewBody;
    if (target.state === 'ok' && target.fragment.length) {
      body.append(DOMSerializer.fromSchema(this.view.state.schema).serializeFragment(Fragment.from(target.fragment)));
    } else {
      body.classList.add(styles.previewEmpty);
      body.textContent = target.state === 'missing-note' ? L.missingNote : target.state === 'missing-passage' ? L.missingPassage : target.state === 'locked' ? L.locked : L.empty;
    }
    card.append(body);
    card.addEventListener('mouseenter', () => this.clearHide());
    card.addEventListener('mouseleave', () => this.scheduleHide());
    document.body.append(card);
    const r = el.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight;
    card.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    card.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    this.card = card;
    this.unregisterEscape = registerEscapeClose(() => this.hide());
  }

  hide() {
    this.clearHide();
    this.card?.remove();
    this.card = null;
    this.unregisterEscape?.();
    this.unregisterEscape = null;
  }

  destroy() {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.hide();
    this.view.dom.removeEventListener('mouseover', this.over);
    this.view.dom.removeEventListener('mouseout', this.out);
  }
}

// ── Behaviour: click, `[[`, the hover card ───────────────────────────────────

export const NoteLinkBehaviour = Extension.create({
  name: 'noteLinkBehaviour',
  priority: 120,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey('noteLink'),
      view: (view) => {
        const preview = new LinkPreview(view);
        return { destroy: () => preview.destroy() };
      },
      props: {
        handleClick(view, pos, event) {
          const el = (event.target as HTMLElement).closest('a[data-note-link]') as HTMLElement | null;
          if (!el || !view.dom.contains(el)) return false;
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            const type = view.state.schema.marks.noteLink;
            const range = type ? getMarkRange(view.state.doc.resolve(pos), type) : null;
            if (range) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
            return true;
          }
          const { noteId, tabId, blockId } = attrsOf(el);
          openNoteLink(noteId, tabId, blockId);
          return true;
        },
        // `[[`: the second bracket opens the note picker; the first is taken back out.
        handleTextInput(view, from, to, text) {
          if (text !== '[' || from !== to) return false;
          const $from = view.state.doc.resolve(from);
          if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return false;
          if ($from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset) !== '[') return false;
          const open = objectTriggerStorage(editor).openNoteLinkPicker;
          if (!open) return false;
          view.dispatch(view.state.tr.delete(from - 1, from));
          open({ purpose: 'link', from: from - 1, to: from - 1 });
          return true;
        },
      },
    })];
  },
});

export const NoteLinkExtensions = [NoteLinkMark, NoteLinkBehaviour];

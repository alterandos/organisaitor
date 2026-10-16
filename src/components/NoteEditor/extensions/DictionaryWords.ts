import { Extension } from '@tiptap/core';
import { placeElement } from '@/utils/floatingPlacement';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import { dictionaryList, dictionaryWords, findDictionaryWords, wordUseCount, type DictionaryWord } from '@/services/dictionary';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import styles from './NoteLink.module.css';
import own from './DictionaryWords.module.css';

// Words from the Dictionary (services/dictionary.ts), wherever they occur in a note: italic on a faint
// shade (a decoration, never stored in the note), and on hover a card with the word, its part of
// speech, its meaning and an example,
// where it came from, when it was added and how often it's used across the notes. Every
// occurrence, not only where it was added (decided with the user 2026-10-15); off in Settings
// (settingsStore.dictionaryHighlight). Not in code.

const key = new PluginKey<DecorationSet>('dictionaryWords');

function decorate(state: EditorState): DecorationSet {
  if (!useSettingsStore.getState().dictionaryHighlight) return DecorationSet.empty;
  const words = dictionaryWords();
  if (words.size === 0) return DecorationSet.empty;
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    // The textblock's text with its positions: each text node in turn (code-marked ones skipped).
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.spec.code)) return;
      const start = pos + 1 + offset;
      for (const hit of findDictionaryWords(child.text ?? '', words.keys())) {
        decos.push(Decoration.inline(start + hit.from, start + hit.to, { 'data-dict-word': hit.key }));
      }
    });
    return false;
  });
  return DecorationSet.create(state.doc, decos);
}

// ── The hover card ───────────────────────────────────────────────────────────

const SHOW_MS = 350;
const HIDE_MS = 200;

class WordCard {
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
    const el = (e.target as HTMLElement).closest?.('[data-dict-word]') as HTMLElement | null;
    if (!el) return;
    this.clearHide();
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.show(el), SHOW_MS);
  };

  private out = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest?.('[data-dict-word]')) return;
    if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
    this.scheduleHide();
  };

  private clearHide() { if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } }
  private scheduleHide() { this.clearHide(); this.hideTimer = setTimeout(() => this.hide(), HIDE_MS); }

  private show(el: HTMLElement) {
    if (!el.isConnected) return;
    const word: DictionaryWord | undefined = dictionaryWords().get(el.getAttribute('data-dict-word') ?? '');
    if (!word) return;
    this.hide();
    const L = LABELS.dictionary;
    const card = document.createElement('div');
    card.className = styles.preview;
    card.setAttribute('role', 'tooltip');
    card.setAttribute('data-dict-card', '');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = styles.previewTitle;
    head.textContent = word.word;
    head.title = L.openList;
    head.addEventListener('click', () => {
      this.hide();
      const list = dictionaryList();
      if (!list) return;
      const ui = useUIStore.getState();
      ui.setListsLastActive(list.id, null);
      ui.setActiveView('lists');
    });
    const top = document.createElement('div');
    top.className = own.top;
    top.append(head);
    if (word.partOfSpeech) {
      const pos = document.createElement('span');
      pos.className = own.pos;
      pos.textContent = word.partOfSpeech;
      top.append(pos);
    }
    const body = document.createElement('div');
    body.className = styles.previewBody;
    if (word.meaning) body.textContent = word.meaning;
    else { body.classList.add(styles.previewEmpty); body.textContent = L.noMeaning; }
    if (word.example) {
      const ex = document.createElement('div');
      ex.className = own.example;
      ex.textContent = L.example(word.example);
      body.append(ex);
    }
    const meta = document.createElement('div');
    meta.className = own.meta;
    const uses = wordUseCount(word.word);
    meta.textContent = [word.source, L.added(formatDate(word.added)), L.uses(uses)].filter(Boolean).join(' · ');
    card.append(top, body, meta);
    card.addEventListener('mouseenter', () => this.clearHide());
    card.addEventListener('mouseleave', () => this.scheduleHide());
    document.body.append(card);
    placeElement(card, el.getBoundingClientRect(), { gap: 6 });
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

export const DictionaryWords = Extension.create({
  name: 'dictionaryWords',

  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_c, state) => decorate(state),
        apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta(key) ? decorate(state) : old.map(tr.mapping, tr.doc)),
      },
      props: { decorations: (state) => key.getState(state) },
      // Words added or removed (here or on another device), or the setting changed: mark them again.
      view: (view) => {
        const card = new WordCard(view);
        const refresh = () => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true)); };
        const offLists = useListStore.subscribe((s, prev) => { if (s.listItems !== prev.listItems || s.lists !== prev.lists) refresh(); });
        const offSettings = useSettingsStore.subscribe((s, prev) => { if (s.dictionaryHighlight !== prev.dictionaryHighlight) refresh(); });
        return { destroy: () => { offLists(); offSettings(); card.destroy(); } };
      },
    })];
  },
});

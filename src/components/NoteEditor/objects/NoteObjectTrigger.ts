import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { NoteObjectContext } from './types';
import { applySession, getSession, type ObjectSession, objectSessionKey, sessionDecorations, withSessionMeta } from './session';
import { acceptKind, commitSession, dismissSession, setHighlight } from './actions';
import { chosenKind } from './kinds';
import { getSelectionMenu, openSelectionMenu, selectionMenuPlugin } from './selectionMenuState';
import { isBlockKind } from './types';

// Set from outside after the editor exists (NoteEditor / NoteObjectMenu effects).
export interface NoteObjectTriggerStorage {
  // Where an object would be created right now (the open note, its tab and Endeavour), or null.
  getContext:  () => NoteObjectContext | null;
  // Set by NoteObjectMenu while its fields are showing: moves focus into the first one.
  focusFields: (() => boolean) | null;
  // Set by SelectionMenu while it's open: a key that reached the editor first (typed before the
  // menu's search box took focus) is handled by the menu. Returns whether it took the key.
  selectionMenuKey: ((event: KeyboardEvent) => boolean) | null;
}

export const objectTriggerStorage = (editor: { storage: unknown }): NoteObjectTriggerStorage =>
  (editor.storage as Record<string, NoteObjectTriggerStorage>).noteObjectTrigger;

// While a `\` session is active, the keys belong to it:
//   picking   — ↑/↓ move, Tab picks, Enter picks (once something is typed or arrows were used)
//   composing — Enter creates, Ctrl/Cmd+Enter opens the full pane, Tab edits the fields
//   both      — Esc ends it and leaves the text as typed
// Consumed keys stop here, so nothing around the editor (the Escape stack, a pane's Ctrl+Enter)
// also acts on them.
function handleSessionKey(view: EditorView, event: KeyboardEvent, storage: NoteObjectTriggerStorage): boolean {
  const s = getSession(view.state);
  if (getSelectionMenu(view.state) && storage.selectionMenuKey?.(event)) { event.preventDefault(); event.stopPropagation(); return true; }
  // `\` over selected text: the selection menu. Caught on the key as well as in handleTextInput,
  // because a selection across paragraphs is replaced without going through handleTextInput.
  if (!s && event.key === '\\' && !event.ctrlKey && !event.metaKey && !event.altKey && !view.state.selection.empty) {
    if (openSelectionMenu(view)) { event.preventDefault(); return true; }
  }
  if (!s || event.isComposing) return false;
  const consume = () => { event.preventDefault(); event.stopPropagation(); return true; };
  const mod = event.ctrlKey || event.metaKey;

  if (event.key === 'Escape') {
    dismissSession(view);
    event.stopPropagation();
    return consume();
  }

  if (s.interp.phase === 'picking') {
    const { matches } = s.interp;
    if (matches.length === 0) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight(view, (s.highlight + step + matches.length) % matches.length);
      return consume();
    }
    const pick = (event.key === 'Tab' && !event.shiftKey && !mod)
      || (event.key === 'Enter' && !event.shiftKey && !mod && (s.query !== '' || s.navigated));
    if (pick) { acceptKind(view, matches[s.highlight]); return consume(); }
    return false;
  }

  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    const ctx = storage.getContext();
    if (!ctx) return false;
    commitSession(view, mod ? 'full' : 'quick', ctx);
    return consume();
  }
  if (event.key === 'Tab' && !event.shiftKey && !mod) {
    storage.focusFields?.();
    return consume();
  }
  return false;
}

export const NoteObjectTrigger = Extension.create<Record<string, never>, NoteObjectTriggerStorage>({
  name: 'noteObjectTrigger',

  addStorage() {
    return { getContext: () => null, focusFields: null, selectionMenuKey: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<ObjectSession | null>({
        key: objectSessionKey,
        state: {
          init: () => null,
          apply: (tr, prev, _old, state) => applySession(tr, prev, state),
        },
        props: {
          decorations: sessionDecorations,
          handleKeyDown: (view, event) => handleSessionKey(view, event, storage),
          handleTextInput: (view, from, to, text) => {
            // `\` over selected text opens the selection menu instead of replacing the text.
            if (text === '\\' && from !== to && !getSession(view.state)) return openSelectionMenu(view);
            const s = getSession(view.state);
            if (!s || from !== to) return false;
            // `\\` right after the `\` that opened a session: one literal backslash, no session.
            if (text === '\\' && from === s.anchor + 1 && s.to === s.anchor + 1) {
              view.dispatch(withSessionMeta(view.state.tr, { type: 'dismiss' }));
              return true;
            }
            // A space after a note block's keyword (`\timeline `, `\tl `) inserts the block.
            if (text === ' ' && from === s.to && s.interp.phase === 'picking') {
              const kind = chosenKind(s.interp.word);
              if (kind && isBlockKind(kind)) { acceptKind(view, kind); return true; }
            }
            return false;
          },
        },
      }),
      selectionMenuPlugin(),
    ];
  },
});

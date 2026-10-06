import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { NoteObjectContext } from './types';
import { applySession, getSession, type ObjectSession, objectSessionKey, sessionDecorations, withSessionMeta } from './session';
import { acceptKind, commitSession, dismissSession, setHighlight } from './actions';

// Set from outside after the editor exists (NoteEditor / NoteObjectMenu effects).
export interface NoteObjectTriggerStorage {
  // Where an object would be created right now (the open note, its tab and Endeavour), or null.
  getContext:  () => NoteObjectContext | null;
  // Set by NoteObjectMenu while its fields are showing: moves focus into the first one.
  focusFields: (() => boolean) | null;
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
    return { getContext: () => null, focusFields: null };
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
          // `\\` right after the `\` that opened a session: one literal backslash, no session.
          handleTextInput: (view, from, to, text) => {
            const s = getSession(view.state);
            if (!s || text !== '\\' || from !== to || from !== s.anchor + 1 || s.to !== s.anchor + 1) return false;
            view.dispatch(withSessionMeta(view.state.tr, { type: 'dismiss' }));
            return true;
          },
        },
      }),
    ];
  },
});

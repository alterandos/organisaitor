import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { exactChar, findCharTrigger, matchChars, type CharMatch } from '@/specialChars/charSets';
import { hideCharPicker, showCharPicker } from '@/specialChars/charPicker';

// `//name` in the note editor: the same characters, list and keys as every other text field
// (src/specialChars/fieldInput.ts), through ProseMirror, since the editor owns its text. Not in
// code, where `//` is a comment.

interface Typing { from: number; to: number; matches: CharMatch[] }

function typingAt(state: EditorState): Typing | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return null;
  const $pos = sel.$from;
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code || $pos.marks().some((m) => m.type.name === 'code')) return null;
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
  const t = findCharTrigger(before);
  if (!t) return null;
  return { from: $pos.start() + t.start, to: sel.from, matches: matchChars(t.query) };
}

const key = new PluginKey('specialCharInput');

export const SpecialCharInput = Extension.create({
  name: 'specialCharInput',
  // Before the other typing helpers (the `\` menu, Glossary links), so its keys win while it's up.
  priority: 140,

  addProseMirrorPlugins() {
    let selected = 0;
    let shownFor: string | null = null;
    let current: Typing | null = null;

    const insert = (view: EditorView, i: number) => {
      const t = typingAt(view.state);
      const m = t?.matches[i];
      if (!t || !m) return false;
      view.dispatch(view.state.tr.insertText(m.char, t.from, t.to).scrollIntoView());
      return true;
    };

    return [new Plugin({
      key,
      view: () => ({
        update(view) {
          current = view.hasFocus() ? typingAt(view.state) : null;
          if (!current) { if (shownFor !== null) { hideCharPicker(); shownFor = null; } return; }
          const sig = `${current.from}:${current.matches.map((m) => m.char).join('')}`;
          if (sig !== shownFor) selected = 0;
          shownFor = sig;
          const at = view.coordsAtPos(current.from);
          showCharPicker({ left: at.left, top: at.top, bottom: at.bottom }, current.matches, selected, (i) => { insert(view, i); view.focus(); });
        },
        destroy() { if (shownFor !== null) hideCharPicker(); },
      }),
      props: {
        handleKeyDown(view, e) {
          if (!current) return false;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const n = Math.max(1, current.matches.length);
            selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            const at = view.coordsAtPos(current.from);
            showCharPicker({ left: at.left, top: at.top, bottom: at.bottom }, current.matches, selected, (i) => { insert(view, i); view.focus(); });
            return true;
          }
          if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.altKey && current.matches.length) {
            return insert(view, selected);
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            current = null;
            shownFor = null;
            hideCharPicker();
            // Typing on starts the list again; until then the `//name` stays as text.
            return true;
          }
          return false;
        },
        // The whole name and a space: the character, keeping the space.
        handleTextInput(view, from, to, text) {
          if (text !== ' ' || from !== to) return false;
          const $pos = view.state.doc.resolve(from);
          if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return false;
          const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
          const t = findCharTrigger(before);
          const ch = t && exactChar(t.query);
          if (!t || !ch) return false;
          view.dispatch(view.state.tr.insertText(`${ch} `, $pos.start() + t.start, from));
          return true;
        },
        handleDOMEvents: {
          blur: () => { if (shownFor !== null) { hideCharPicker(); shownFor = null; } current = null; return false; },
        },
      },
    })];
  },
});

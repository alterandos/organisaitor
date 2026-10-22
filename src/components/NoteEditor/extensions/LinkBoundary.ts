import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// A space typed at the end of a link ends the link (found 2026-10-19: a pasted URL went on
// swallowing whatever was typed after it, spaces too). Tiptap's link mark is inclusive while
// autolink is on, so text typed at its end joins it; letters still do, so a URL typed in pieces
// stays one link, but whitespace never does.
export const LinkBoundary = Extension.create({
  name: 'linkBoundary',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('linkBoundary'),
      props: {
        handleTextInput(view, from, to, text) {
          if (!/^\s+$/.test(text)) return false;
          const link = view.state.schema.marks.link;
          if (!link) return false;
          const $from = view.state.doc.resolve(from);
          const marks = view.state.storedMarks ?? $from.marks();
          if (!link.isInSet(marks)) return false;
          if ($from.nodeAfter && link.isInSet($from.nodeAfter.marks)) return false;
          view.dispatch(view.state.tr.insertText(text, from, to).removeMark(from, from + text.length, link).setStoredMarks(link.removeFromSet(marks)));
          return true;
        },
      },
    })];
  },
});

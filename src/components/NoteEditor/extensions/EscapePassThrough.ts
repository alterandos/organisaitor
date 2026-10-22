import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ProseMirror cancels (preventDefault) every Escape typed in an editor, whether or not anything in
// the editor uses it, and the Escape stack (hooks/useEscapeClose.ts) passes over a cancelled key.
// So Escape typed in an editor never closed the overlay around it: the scratchpad's "Close (Esc)"
// did nothing (found 2026-10-22 in a real browser; jsdom has no such capture). This runs the
// editor's own Escape handlers itself (a `\` session, a typing offer, selecting the block), and
// cancels the key only when one of them took it; otherwise the key goes on, uncancelled, to the
// stack. Every rich-text editor loads it (pattern test), as it loads SpecialCharInput.
export const EscapePassThrough = Extension.create({
  name: 'escapePassThrough',
  // Last, so every other plugin's own keydown handling comes first.
  priority: 1,

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('escapePassThrough'),
      props: {
        handleDOMEvents: {
          keydown(view, event) {
            if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return false;
            if (view.someProp('handleKeyDown', (f) => f(view, event))) event.preventDefault();
            // Handled here either way, so ProseMirror's blanket capture doesn't run.
            return true;
          },
        },
      },
    })];
  },
});

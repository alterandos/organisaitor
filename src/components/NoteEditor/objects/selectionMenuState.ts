import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// `\` typed with text selected: instead of replacing the text, a menu opens on it (SelectionMenu
// .tsx) to link it to a Glossary term or mark it (Definition, Concept, Important…, Review later).
// This state only says which text it's for; it closes when the text or the selection changes.

export interface SelectionMenuState { from: number; to: number }
type Meta = { open: SelectionMenuState } | { close: true };

export const selectionMenuKey = new PluginKey<SelectionMenuState | null>('noteSelectionMenu');

export const getSelectionMenu = (state: EditorState) => selectionMenuKey.getState(state) ?? null;

// Opens it on the current selection, if it's text outside code. Returns whether it opened.
export function openSelectionMenu(view: EditorView): boolean {
  const { from, to, empty, $from } = view.state.selection;
  if (empty || $from.parent.type.spec.code || !view.state.doc.textBetween(from, to).trim()) return false;
  view.dispatch(view.state.tr.setMeta(selectionMenuKey, { open: { from, to } } satisfies Meta));
  return true;
}

export function closeSelectionMenu(view: EditorView): void {
  if (getSelectionMenu(view.state)) view.dispatch(view.state.tr.setMeta(selectionMenuKey, { close: true } satisfies Meta));
}

export const selectionMenuPlugin = () => new Plugin<SelectionMenuState | null>({
  key: selectionMenuKey,
  state: {
    init: () => null,
    apply: (tr, value, _old, state) => {
      const meta = tr.getMeta(selectionMenuKey) as Meta | undefined;
      if (meta && 'open' in meta) return meta.open;
      if (!value || (meta && 'close' in meta) || tr.docChanged) return null;
      const { from, to } = state.selection;
      return from === value.from && to === value.to ? value : null;
    },
  },
});

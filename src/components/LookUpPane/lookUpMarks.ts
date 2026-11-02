import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { contextRanges, type Passage } from '@/utils/notePassages';

// Look up's preview is the note's own editor, read-only; this marks the passage found
// (`data-lookup-passage`) and everything around it (`data-lookup-context`, drawn greyed).
const key = new PluginKey<DecorationSet>('lookUpMarks');

export const LookUpMarks = Extension.create({
  name: 'lookUpMarks',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => (tr.getMeta(key) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
      },
      props: { decorations: (state) => key.getState(state) },
    })];
  },
});

export function markPassage(state: EditorState, p: Pick<Passage, 'pos' | 'kind'>) {
  const { passage, context } = contextRanges(state.doc, p);
  const decorations = [
    ...passage.map(([from, to]) => Decoration.node(from, to, { 'data-lookup-passage': '' })),
    ...context.map(([from, to]) => Decoration.node(from, to, { 'data-lookup-context': '' })),
  ];
  return state.tr.setMeta(key, DecorationSet.create(state.doc, decorations)).setMeta('addToHistory', false);
}

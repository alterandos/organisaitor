import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { COMPARE_DESIGNS, addCompareSide, comparePosAt, removeCompareSide, setCompareVariant, type CompareVariant } from './Compare';

// Right-click on a comparison: add a side, remove the side clicked; its design and frame.
registerContextMenuProvider({
  id: 'note-editor.compare',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="compare"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const at = comparePosAt(view, ctx.target);
    const node = at ? view.state.doc.nodeAt(at.pos) : null;
    if (!at || !node) return [];
    const L = LABELS.noteBlocks.compare;
    return [
      { id: 'compare-add-side', label: L.addSide, icon: '+', run: () => addCompareSide(view, at.pos) },
      { id: 'compare-remove-side', label: L.removeSide, icon: '−', disabled: node.childCount <= 2, run: () => removeCompareSide(view, at.pos, at.sideIndex) },
      designMenuItem(COMPARE_DESIGNS, node.attrs.variant as CompareVariant, (v) => setCompareVariant(view, at.pos, v)),
      frameMenuItem(view, at.pos, node.attrs),
    ];
  },
});

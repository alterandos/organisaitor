import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { MATH_DESIGNS, editMathAt, mathPosAt, setMathSettings, type MathVariant } from './Maths';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click on maths: edit it, copy its LaTeX; for a block, its design and frame.
registerContextMenuProvider({
  id: 'note-editor.maths',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="math"], [data-type="math-inline"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = mathPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.maths;
    const items = [
      { id: 'maths-edit', label: L.edit, icon: '∑', shortcut: 'Enter', run: () => editMathAt(view, pos) },
      { id: 'maths-copy', label: L.copyLatex, icon: '⎘', run: () => { void navigator.clipboard.writeText(node.attrs.latex as string).catch(() => undefined); } },
    ];
    if (node.type.name !== 'mathBlock') return items;
    return [
      ...items,
      designMenuItem(MATH_DESIGNS, node.attrs.variant as MathVariant, (v) => setMathSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

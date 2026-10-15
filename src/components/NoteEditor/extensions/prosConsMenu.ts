import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import type { ContextMenuItem } from '@/contextMenu/types';
import { PROSCONS_DESIGNS, prosConsPosAt, setPointWeight, setProsConsVariant } from './ProsCons';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a pros-and-cons block: its design and frame, and (on a point, in this block or in
// an option of the options block) the point's weight.
registerContextMenuProvider({
  id: 'note-editor.proscons',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="proscons"], [data-pc-point]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const L = LABELS.noteBlocks.prosCons;
    const items: ContextMenuItem[] = [];
    const pos = prosConsPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos !== null && node) items.push(designMenuItem(PROSCONS_DESIGNS, node.attrs.variant, (v) => setProsConsVariant(view, pos, v)), frameMenuItem(view, pos, node.attrs));
    const pointEl = ctx.target.closest('[data-pc-point]');
    let pp: number | null = null;
    try { if (pointEl) pp = view.posAtDOM(pointEl, 0) - 1; } catch { pp = null; }
    const point = pp === null ? null : view.state.doc.nodeAt(pp);
    if (pp !== null && point?.type.name === 'prosConsPoint') {
      const at = pp;
      items.push({
        id: 'pc-weight', label: L.weight, icon: '●',
        submenu: [[1, 2, 3].map((w) => ({ id: `pc-weight-${w}`, label: L.weightN(w), icon: point.attrs.weight === w ? '✓' : undefined, run: () => setPointWeight(view, at, w) }))],
      });
    }
    return items;
  },
});

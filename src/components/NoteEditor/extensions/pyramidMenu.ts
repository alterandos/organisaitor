import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { PYRAMID_DESIGNS, addLayer, canDeleteLayer, deleteLayer, pyramidPosAt, setPyramidSettings } from './Pyramid';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a pyramid: its design, colours, frame, adding a layer, and (on a layer) deleting it.
registerContextMenuProvider({
  id: 'note-editor.pyramid',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="pyramid"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = pyramidPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.pyramid;
    const C = LABELS.noteBlocks.cycle;
    const items = [
      designMenuItem(PYRAMID_DESIGNS, node.attrs.variant, (v) => setPyramidSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'py-colours', label: C.colourTitle(C.colours[node.attrs.colours as 'accent' | 'spectrum']).split('.')[0], icon: '◐',
        submenu: [(['accent', 'spectrum'] as const).map((c) => ({ id: `colours-${c}`, label: C.colours[c], icon: node.attrs.colours === c ? '✓' : undefined, run: () => setPyramidSettings(view, pos, { colours: c }) }))],
      },
      { id: 'py-add', label: L.addLayer, icon: '+', run: () => addLayer(view, pos) },
      { id: 'py-add-top', label: L.addLayerTop, icon: '+', run: () => addLayer(view, pos, true) },
    ];
    const layerEl = ctx.target.closest('[data-type="pyramid-layer"]');
    let lp: number | null = null;
    try { if (layerEl) lp = view.posAtDOM(layerEl, 0) - 1; } catch { lp = null; }
    if (lp !== null && view.state.doc.nodeAt(lp)?.type.name === 'pyramidLayer') {
      const at = lp;
      items.push({ id: 'py-delete', label: L.deleteLayer, icon: '×', disabled: !canDeleteLayer(view.state, at), run: () => { deleteLayer(view, at); } });
    }
    return items;
  },
});

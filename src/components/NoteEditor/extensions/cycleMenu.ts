import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { ARROW_DIRECTIONS, CYCLE_DESIGNS, ICON_SHAPES, ICON_SIZES, addStage, canDeleteStage, cyclePosAt, deleteStage, reverseCycle, setCycleSettings, setStageAttrs } from './Cycle';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a cycle: its design and options (as the pill at its top right), and, on a stage,
// that stage's arrow.
registerContextMenuProvider({
  id: 'note-editor.cycle',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="cycle"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = cyclePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.cycle;
    const tick = (on: boolean) => (on ? '✓' : undefined);
    const items = [
      designMenuItem(CYCLE_DESIGNS, node.attrs.variant, (v) => setCycleSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      { id: 'cycle-numbered', label: node.attrs.numbered ? L.unnumbered : L.numbered, icon: '#', run: () => setCycleSettings(view, pos, { numbered: !node.attrs.numbered }) },
      {
        id: 'cycle-colours', label: L.colourTitle(L.colours[node.attrs.colours as 'accent' | 'spectrum']).split('.')[0], icon: '◐',
        submenu: [(['accent', 'spectrum'] as const).map((c) => ({ id: `colours-${c}`, label: L.colours[c], icon: tick(node.attrs.colours === c), run: () => setCycleSettings(view, pos, { colours: c }) }))],
      },
      { id: 'cycle-reverse', label: L.reverse, icon: '⇄', run: () => reverseCycle(view, pos) },
      { id: 'cycle-add', label: L.addStage, icon: '+', run: () => addStage(view, pos) },
      {
        id: 'cycle-icons', label: L.iconShape, icon: '◯',
        submenu: [
          ICON_SHAPES.map((s) => ({ id: `shape-${s}`, label: L.shapes[s], icon: tick(node.attrs.iconShape === s), run: () => setCycleSettings(view, pos, { iconShape: s }) })),
          ICON_SIZES.map((s) => ({ id: `size-${s}`, label: L.sizes[s], icon: tick(node.attrs.iconSize === s), run: () => setCycleSettings(view, pos, { iconSize: s }) })),
        ],
      },
    ];
    // On a stage: its arrow's direction.
    const stageEl = ctx.target.closest('[data-type="cycle-stage"]');
    let stagePos: number | null = null;
    try { if (stageEl) stagePos = view.posAtDOM(stageEl, 0) - 1; } catch { stagePos = null; }
    const stage = stagePos === null ? null : view.state.doc.nodeAt(stagePos);
    if (stage?.type.name === 'cycleStage' && stagePos !== null) {
      const sp = stagePos;
      items.push({
        id: 'cycle-arrow', label: L.arrowTitle, icon: '→',
        submenu: [ARROW_DIRECTIONS.map((d) => ({ id: `arrow-${d}`, label: L.arrowDirections[d], icon: tick(stage.attrs.arrow === d), run: () => setStageAttrs(view, sp, { arrow: d }) }))],
      });
      items.push({ id: 'cycle-delete-stage', label: L.deleteStage, icon: '×', disabled: !canDeleteStage(view.state, sp), run: () => { deleteStage(view, sp); } });
    }
    return items;
  },
});

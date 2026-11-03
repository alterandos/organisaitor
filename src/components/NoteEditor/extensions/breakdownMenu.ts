import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { BREAKDOWN_DESIGNS, addPart, breakdownPosAt, setBreakdownSettings } from './Breakdown';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { PaletteIcon } from '@/components/Icons';

// Right-click in a breakdown: its design, colours, frame, adding a part (a part’s own actions: blockParts.ts).
registerContextMenuProvider({
  id: 'note-editor.breakdown',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="breakdown"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = breakdownPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.breakdown;
    const C = LABELS.noteBlocks.cycle;
    return [
      designMenuItem(BREAKDOWN_DESIGNS, node.attrs.variant, (v) => setBreakdownSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'bd-colours', label: C.colourTitle(C.colours[node.attrs.colours as 'accent' | 'spectrum']).split('.')[0], icon: createElement(PaletteIcon),
        submenu: [(['accent', 'spectrum'] as const).map((c) => ({ id: `colours-${c}`, label: C.colours[c], icon: node.attrs.colours === c ? '✓' : undefined, run: () => setBreakdownSettings(view, pos, { colours: c }) }))],
      },
      { id: 'bd-add', label: L.addPart, icon: '+', run: () => addPart(view, pos) },
    ];
  },
});

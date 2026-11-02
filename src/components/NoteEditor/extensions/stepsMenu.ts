import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { STEPS_DESIGNS, addStep, canDeleteStep, deleteStep, setStepsSettings, stepsPosAt } from './Steps';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { PaletteIcon, TrashIcon } from '@/components/Icons';

// Right-click in a steps block: its design, colours, frame, adding a step, and (on a step) deleting it.
registerContextMenuProvider({
  id: 'note-editor.steps',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="steps"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = stepsPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.steps;
    const C = LABELS.noteBlocks.cycle;
    const items = [
      designMenuItem(STEPS_DESIGNS, node.attrs.variant, (v) => setStepsSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'st-colours', label: C.colourTitle(C.colours[node.attrs.colours as 'accent' | 'spectrum']).split('.')[0], icon: createElement(PaletteIcon),
        submenu: [(['accent', 'spectrum'] as const).map((c) => ({ id: `colours-${c}`, label: C.colours[c], icon: node.attrs.colours === c ? '✓' : undefined, run: () => setStepsSettings(view, pos, { colours: c }) }))],
      },
      { id: 'st-add', label: L.addStep, icon: '+', run: () => addStep(view, pos) },
      { id: 'st-add-start', label: L.addStepStart, icon: '+', run: () => addStep(view, pos, true) },
    ];
    const stepEl = ctx.target.closest('[data-type="steps-step"]');
    let sp: number | null = null;
    try { if (stepEl) sp = view.posAtDOM(stepEl, 0) - 1; } catch { sp = null; }
    if (sp !== null && view.state.doc.nodeAt(sp)?.type.name === 'stepsStep') {
      const at = sp;
      items.push({ id: 'st-delete', label: L.deleteStep, icon: createElement(TrashIcon, { width: '1em', height: '1em' }), disabled: !canDeleteStep(view.state, at), run: () => { deleteStep(view, at); } });
    }
    return items;
  },
});

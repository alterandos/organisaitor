import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { IDKEY_DESIGNS, addChoice, addStep, canDeleteStep, deleteStep, idKeyPosAt, setIdKeyVariant } from './IdKey';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in an identification key: its design, frame, adding a step, and (on a step) adding a
// choice to it or removing it.
registerContextMenuProvider({
  id: 'note-editor.idkey',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="idkey"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = idKeyPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.idKey;
    const items = [
      designMenuItem(IDKEY_DESIGNS, node.attrs.variant, (v) => setIdKeyVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      { id: 'ik-add-step', label: L.addStep, icon: '+', run: () => addStep(view, pos) },
    ];
    const stepEl = ctx.target.closest('[data-type="idkey-step"]');
    let sp: number | null = null;
    try { if (stepEl) sp = view.posAtDOM(stepEl, 0) - 1; } catch { sp = null; }
    if (sp !== null && view.state.doc.nodeAt(sp)?.type.name === 'idKeyStep') {
      const at = sp;
      items.push({ id: 'ik-add-choice', label: L.addChoice, icon: '+', run: () => addChoice(view, at) });
      items.push({ id: 'ik-delete-step', label: L.deleteStep, icon: '×', disabled: !canDeleteStep(view.state, at), run: () => { deleteStep(view, at); } });
    }
    return items;
  },
});

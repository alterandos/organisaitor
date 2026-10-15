import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteEditorMenuApi } from '../contextMenu';
import { LABELS } from '@/config/labels';
import { CONCLUSION_DESIGNS, addReason, conclusionPosAt, setConclusionVariant } from './Conclusion';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a conclusion: its design, frame and adding a reason (the same as its pill's buttons).
registerContextMenuProvider({
  id: 'note-editor.conclusion',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="conclusion"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = conclusionPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    return [
      designMenuItem(CONCLUSION_DESIGNS, node.attrs.variant, (v) => setConclusionVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      { id: 'cc-add-reason', label: LABELS.noteBlocks.conclusion.addReason, icon: '+', run: () => addReason(view, pos) },
    ];
  },
});

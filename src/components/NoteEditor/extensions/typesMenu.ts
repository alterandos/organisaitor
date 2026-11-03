import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { TYPES_DESIGNS, addType, setTypesVariant, typesPosAt } from './Types';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a types block: its design, frame, adding a type (a type’s own actions: blockParts.ts).
registerContextMenuProvider({
  id: 'note-editor.types',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="types"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = typesPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.types;
    return [
      designMenuItem(TYPES_DESIGNS, node.attrs.variant, (v) => setTypesVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      { id: 'ty-add', label: L.addType, icon: '+', run: () => addType(view, pos) },
    ];
  },
});

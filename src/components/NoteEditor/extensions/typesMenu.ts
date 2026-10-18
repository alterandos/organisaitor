import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { TYPES_DESIGNS, addType, canDeleteType, deleteType, setTypesVariant, typesPosAt } from './Types';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { TrashIcon } from '@/components/Icons';

// Right-click in a types block: its design, frame, adding a type, and (on a type) removing it.
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
    const items = [
      designMenuItem(TYPES_DESIGNS, node.attrs.variant, (v) => setTypesVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      { id: 'ty-add', label: L.addType, icon: '+', run: () => addType(view, pos) },
    ];
    const itemEl = ctx.target.closest('[data-type="types-item"]');
    let ip: number | null = null;
    try { if (itemEl) ip = view.posAtDOM(itemEl, 0) - 1; } catch { ip = null; }
    if (ip !== null && view.state.doc.nodeAt(ip)?.type.name === 'typesItem') {
      const at = ip;
      items.push({ id: 'ty-delete', label: L.deleteType, icon: createElement(TrashIcon, { width: '1em', height: '1em' }), disabled: !canDeleteType(view.state, at), run: () => { deleteType(view, at); } });
    }
    return items;
  },
});

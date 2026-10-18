import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import type { ContextMenuItem } from '@/contextMenu/types';
import { OPTIONS_DESIGNS, OPTION_STATUSES, addOption, canDeleteOption, deleteOption, optionsPosAt, setOptionAttrs, setOptionsVariant } from './Options';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { StatusIcon, TrashIcon } from '@/components/Icons';

// Right-click in an options block: its design, frame, adding an option, and (on an option) its
// status and removing it.
registerContextMenuProvider({
  id: 'note-editor.options',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-type="options"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = optionsPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.options;
    const items: ContextMenuItem[] = [
      designMenuItem(OPTIONS_DESIGNS, node.attrs.variant, (v) => setOptionsVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      { id: 'op-add', label: L.addOption, icon: '+', run: () => addOption(view, pos) },
    ];
    const itemEl = ctx.target.closest('[data-type="options-item"]');
    let ip: number | null = null;
    try { if (itemEl) ip = view.posAtDOM(itemEl, 0) - 1; } catch { ip = null; }
    const item = ip === null ? null : view.state.doc.nodeAt(ip);
    if (ip !== null && item?.type.name === 'optionsItem') {
      const at = ip;
      items.push({
        id: 'op-status', label: L.status, icon: createElement(StatusIcon),
        submenu: [OPTION_STATUSES.map((s) => ({ id: `op-status-${s}`, label: L.statuses[s], icon: item.attrs.status === s ? '✓' : undefined, run: () => setOptionAttrs(view, at, { status: s }) }))],
      });
      items.push({ id: 'op-delete', label: L.deleteOption, icon: createElement(TrashIcon, { width: '1em', height: '1em' }), disabled: !canDeleteOption(view.state, at), run: () => { deleteOption(view, at); } });
    }
    return items;
  },
});

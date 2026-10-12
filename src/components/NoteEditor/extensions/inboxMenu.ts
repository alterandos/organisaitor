import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { INBOX_ICON } from '@/config/itemIcons';
import { makeItemTask, openItemSource, selectionTouchesInbox, taskExists } from '@/services/noteInbox';
import { INBOX_ORDERS, INBOX_STATUSES, type InboxOrder, type InboxStatus } from '@/utils/noteInboxes';
import type { NoteEditorMenuApi } from '../contextMenu';
import {
  INBOX_DESIGNS, deleteItem, inboxPosAt, itemPosAt, setInboxDesign, setInboxOrder, setItemStatus, type InboxVariant,
} from './Inbox';
import { designMenuItem, frameMenuItem } from './blockDesigns';

const tick = (on: boolean) => (on ? '✓' : undefined);

// Right-click on an inbox item: its status, a task, where it came from, delete. Clicked thing
// first: the item's own entries come before the inbox's.
registerContextMenuProvider({
  id: 'note-editor.inbox-item',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-type="inbox-item"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = itemPosAt(view, ctx.target);
    const item = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !item) return [];
    const L = LABELS.noteBlocks.inbox;
    const hasTask = taskExists(item.attrs.taskId as string | null);
    return [
      {
        id: 'inbox-status', label: L.status, icon: '💡',
        submenu: [INBOX_STATUSES.map((s: InboxStatus) => ({ id: `inbox-status-${s}`, label: L.statuses[s], icon: tick(item.attrs.status === s), run: () => setItemStatus(view, pos, s) }))],
      },
      { id: 'inbox-task', label: hasTask ? L.openTask : L.makeTask, icon: '✔', disabled: !hasTask && !view.editable, run: () => makeItemTask(view, pos) },
      ...(item.attrs.fromNote ? [{ id: 'inbox-source', label: L.fromTitle, icon: '↩', run: () => openItemSource(item.attrs.fromNote as string, String(item.attrs.itemId)) }] : []),
      { id: 'inbox-delete', label: L.deleteItem, icon: createElement(TrashIcon), destructive: true, disabled: !view.editable, run: () => deleteItem(view, pos) },
    ];
  },
});

// Right-click anywhere in an inbox: its design, order and frame.
registerContextMenuProvider({
  id: 'note-editor.inbox',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="inbox"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = inboxPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.inbox;
    return [
      designMenuItem(INBOX_DESIGNS, node.attrs.variant as InboxVariant, (v) => setInboxDesign(view, pos, v)),
      {
        id: 'inbox-order', label: L.orderMenu, icon: '⇅',
        submenu: [INBOX_ORDERS.map((o: InboxOrder) => ({ id: `inbox-order-${o}`, label: L.order[o], icon: tick(node.attrs.order === o), run: () => setInboxOrder(view, pos, o) }))],
      },
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

// Right-click on selected text (outside an inbox): Send to inbox….
registerContextMenuProvider({
  id: 'note-editor.send-to-inbox',
  kind: 'note-editor',
  order: 8,
  items: (_ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const { state } = api.editor;
    if (state.selection.empty || !api.editor.isEditable || selectionTouchesInbox(state)) return [];
    return [{ id: 'send-to-inbox', label: LABELS.sendToInbox.menu, icon: INBOX_ICON, run: () => api.sendToInbox() }];
  },
});

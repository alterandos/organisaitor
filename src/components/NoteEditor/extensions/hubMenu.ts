import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { HUB_ICON } from '@/config/itemIcons';
import { openHubLink, removeLink, selectionTouchesHub, setLinkRelation } from '@/services/noteHubs';
import { RELATIONS, type HubLinkKind } from '@/utils/noteHubs';
import type { NoteEditorMenuApi } from '../contextMenu';
import { HUB_DESIGNS, hubPosAt, linkPosAt, requestHubLinkPicker, setHubDesign, type HubVariant } from './Hub';
import { designMenuItem, frameMenuItem } from './blockDesigns';

const tick = (on: boolean) => (on ? '✓' : undefined);

// Right-click on a hub's link: open it, how it relates, take it out. Clicked thing first.
registerContextMenuProvider({
  id: 'note-editor.hub-link',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-type="hub-link"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = linkPosAt(view, ctx.target);
    const link = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !link) return [];
    const L = LABELS.hubs;
    const a = link.attrs;
    return [
      { id: 'hub-link-open', label: L.open, icon: '↗', shortcut: 'Enter', run: () => openHubLink({ kind: a.kind as HubLinkKind, noteId: a.noteId, entryId: a.entryId, linkId: a.linkId }) },
      {
        id: 'hub-link-relation', label: L.relation, icon: '⇄', disabled: !view.editable,
        submenu: [RELATIONS.map((r) => ({ id: `hub-relation-${r}`, label: L.relations[r].label, icon: tick(a.relation === r), run: () => setLinkRelation(view, pos, r) }))],
      },
      { id: 'hub-link-remove', label: L.remove, icon: createElement(TrashIcon), destructive: true, disabled: !view.editable, run: () => removeLink(view, pos) },
    ];
  },
});

// Right-click anywhere in a hub: + Link…, its design and frame.
registerContextMenuProvider({
  id: 'note-editor.hub',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="hub"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = hubPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    return [
      { id: 'hub-add-link', label: LABELS.hubs.linkTitle, icon: '＋', disabled: !view.editable, run: () => requestHubLinkPicker(view, pos) },
      designMenuItem(HUB_DESIGNS, node.attrs.variant as HubVariant, (v) => setHubDesign(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

// Right-click on selected text (outside a hub): Add to hub….
registerContextMenuProvider({
  id: 'note-editor.add-to-hub',
  kind: 'note-editor',
  order: 8,
  items: (_ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const { state } = api.editor;
    if (state.selection.empty || !api.editor.isEditable || selectionTouchesHub(state)) return [];
    return [{ id: 'add-to-hub', label: LABELS.hubs.menu, icon: HUB_ICON, run: () => api.addToHub() }];
  },
});

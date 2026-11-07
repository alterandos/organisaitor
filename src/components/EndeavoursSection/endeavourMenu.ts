import { createElement, useRef } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import type { ContextMenuItem } from '@/contextMenu/types';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { pinMenuItem } from '@/services/quickAccessPins';
import { captureTemplate } from '@/services/templates';
import { archiveEndeavourAsked, deleteEndeavourAsked } from '@/services/endeavourArchive';
import { ArchiveIcon, EditIcon, EndeavourIcon, OpenIcon, RestoreIcon, TrashIcon } from '@/components/Icons';
import type { CollectionId } from '@/types';

// Right-click on an Endeavour anywhere in the Endeavours section (the user, 2026-11-07): its row in
// the tree, a part's card, the open home's heading. One provider for every place, each of which
// declares `kind: 'endeavour'` with the Endeavour's id (useEndeavourMenu). Every action goes through
// the same function as its button: the form, the archive and delete questions, the home's actions.

export const ENDEAVOUR_MENU_KIND = 'endeavour';
interface EndeavourMenuData { id: CollectionId }

const L = LABELS.endeavourHome;
const ui = () => useUIStore.getState();

function endeavourMenuItems(id: CollectionId): ContextMenuItem[][] {
  const c = useTaskStore.getState().collections[id];
  if (!c) return [];
  const homeOpen = ui().activeView === 'endeavours' && ui().endeavourHomeId === id;
  return [
    [
      ...(homeOpen ? [] : [{ id: 'endeavour-open', label: L.menu.open, icon: createElement(OpenIcon), run: () => ui().openEndeavourHome(id) }]),
      { id: 'endeavour-edit', label: `${L.edit}…`, icon: createElement(EditIcon), run: () => ui().openEditCollection(c) },
      { id: 'endeavour-part', label: L.menu.addPart, icon: createElement(EndeavourIcon), run: () => ui().showTemplates(id) },
      pinMenuItem('endeavour', id),
    ],
    [
      { id: 'endeavour-calendar', label: L.openCalendar, run: () => { ui().setActiveView('calendar'); ui().setActiveCollection(id); } },
      { id: 'endeavour-overview', label: L.openOverview, run: () => ui().openEndeavourOverview(id) },
      { id: 'endeavour-contents', label: LABELS.endeavourContents.manage, run: () => ui().showEndeavourContents(id) },
      { id: 'endeavour-template', label: LABELS.templates.saveFrom, run: () => { const t = captureTemplate(id); if (t) ui().openTemplateEditor(t); } },
      { id: 'endeavour-restructure', label: `${LABELS.restructure.menu}…`, run: () => ui().showRestructure(id) },
    ],
    [
      c.archivedAt
        ? { id: 'endeavour-restore', label: LABELS.itemActions.restore, icon: createElement(RestoreIcon), run: () => archiveEndeavourAsked(id, false) }
        : { id: 'endeavour-archive', label: LABELS.itemActions.archive, icon: createElement(ArchiveIcon), run: () => archiveEndeavourAsked(id, true) },
      { id: 'endeavour-delete', label: `${LABELS.rowActions.delete}…`, icon: createElement(TrashIcon), destructive: true, run: async () => {
        if (await deleteEndeavourAsked(id) && ui().endeavourHomeId === id) ui().openEndeavourHome(null);
      } },
    ],
  ];
}

// Each group is its own section of the menu (a divider between them).
(['open', 'more', 'end'] as const).forEach((section, i) => registerContextMenuProvider({
  id: `endeavour.${section}`,
  kind: ENDEAVOUR_MENU_KIND,
  order: 10 + i,
  items: (_ctx, scope) => endeavourMenuItems((scope.data as EndeavourMenuData).id)[i] ?? [],
}));

// An element that stands for an Endeavour: right-click it for the Endeavour's menu.
export function useEndeavourMenu<T extends Element>(id: CollectionId) {
  const ref = useRef<T>(null);
  useContextMenuScope(ref, () => ({ kind: ENDEAVOUR_MENU_KIND, data: { id } satisfies EndeavourMenuData }));
  return ref;
}

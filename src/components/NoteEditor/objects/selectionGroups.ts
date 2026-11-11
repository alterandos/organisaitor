import { createElement, type ReactNode } from 'react';
import { LABELS } from '@/config/labels';
import { LinkIcon, TagIcon } from '@/components/Icons';

// The groups of what can be done with selected note text (objects/selectionActions.ts): their
// order, names and icons, for every menu that shows them (the `\` menu, right-click, a block's
// Annotate ▸), so none keeps its own. Groups by what happens to the text (agreed with the user
// 2026-11-05).
export type SelectionActionGroup = 'mark' | 'turn' | 'link' | 'send';

// The groups, in the order they're likeliest wanted (the user, 2026-11-10): turn into, send,
// annotate, link. Both menus draw them from here: the `\` menu as headings, right-click as its
// families (`menuId` is that item's id).
export interface SelectionGroupDef { id: SelectionActionGroup; menuId: string; label: string; icon: ReactNode }
export function selectionGroups(): SelectionGroupDef[] {
  const G = LABELS.selectionMenu.groups;
  return [
    { id: 'turn', menuId: 'turn-into',      label: G.turn, icon: '⇢' },
    { id: 'send', menuId: 'send-selection', label: G.send, icon: '➦' },
    { id: 'mark', menuId: 'mark-as',        label: G.mark, icon: createElement(TagIcon) },
    { id: 'link', menuId: 'link',           label: G.link, icon: createElement(LinkIcon) },
  ];
}
export const SELECTION_ACTION_GROUPS: readonly SelectionActionGroup[] = selectionGroups().map((g) => g.id);
export const selectionGroup = (id: SelectionActionGroup): SelectionGroupDef => selectionGroups().find((g) => g.id === id)!;

// Sets right-click folds into a submenu of their own (the `\` menu lists them under a heading).
export const SELECTION_SUBMENU_SETS: Record<string, { label: () => string; icon: ReactNode }> = {
  terms: { label: () => LABELS.selectionMenu.glossaryTerms, icon: '📖' },
};

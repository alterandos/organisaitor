import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { useSettingsStore } from '@/store/settingsStore';
import type { NoteEditorMenuApi } from '../contextMenu';
import { headingFoldSummary, headingPosAt, setHeadingFoldLevel, toggleHeadingFold } from './HeadingFold';

// Right-click menus follow "the clicked thing first, families fold" (CLAUDE.md "Right-click
// menus"): on a heading, collapsing that heading is the likely action, so it's at the top level and
// first; the rest of the heading family sits under one Headings ▸ anywhere in a note with headings.
const L = LABELS.noteHeadings;
const api = (data: unknown) => data as NoteEditorMenuApi;

registerContextMenuProvider({
  id: 'note-editor.heading',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('h1, h2, h3, h4, h5'),
  items: (ctx, scope) => {
    const view = api(scope.data).editor.view;
    const pos = headingPosAt(view, ctx.target);
    const summary = headingFoldSummary(view.state);
    const fold = pos === null ? null : summary.foldAt(pos);
    if (!fold) return [];
    return [{
      id: 'heading-fold',
      label: fold.collapsed ? L.expand : L.collapse,
      shortcut: 'Ctrl+.',
      disabled: !summary.canFold(fold),
      run: () => toggleHeadingFold(view, fold.pos),
    }];
  },
});

registerContextMenuProvider({
  id: 'note-editor.headings',
  kind: 'note-editor',
  order: 35,
  items: (_ctx, scope) => {
    const view = api(scope.data).editor.view;
    const summary = headingFoldSummary(view.state);
    if (!summary.hasHeadings) return [];
    const levels = [1, 2, 3, 4, 5];
    const settings = useSettingsStore.getState();
    return [{
      id: 'headings',
      label: L.family,
      submenu: [
        [
          { id: 'collapse-all', label: L.collapseAll, run: () => setHeadingFoldLevel(view, 1) },
          ...(summary.anyCollapsed ? [{ id: 'expand-all', label: L.expandAll, run: () => setHeadingFoldLevel(view, null) }] : []),
          {
            id: 'show-to-level', label: L.showToLevel,
            submenu: [levels.map((n) => ({ id: `level-${n}`, label: L.level(n), run: () => setHeadingFoldLevel(view, n) }))],
          },
        ],
        [{ id: 'sticky', label: L.sticky, icon: settings.stickyHeadings ? '✓' : undefined, run: settings.toggleStickyHeadings }],
      ],
    }];
  },
});

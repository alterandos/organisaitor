import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { HIERARCHY_DESIGNS, hierarchyPosAt, openTierEditor, setHierarchySettings } from './Hierarchy';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a hierarchy: its design, colours, frame, and naming its levels.
registerContextMenuProvider({
  id: 'note-editor.hierarchy',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="hierarchy"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = hierarchyPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.hierarchy;
    const C = LABELS.noteBlocks.cycle;
    const anchor = (ctx.target.closest('[data-type="hierarchy"]') as HTMLElement).getBoundingClientRect();
    return [
      designMenuItem(HIERARCHY_DESIGNS, node.attrs.variant, (v) => setHierarchySettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'hi-colours', label: L.colourTitle(node.attrs.colours === 'spectrum' ? L.colours.spectrum : C.colours.accent).split('.')[0], icon: '◐',
        submenu: [(['accent', 'spectrum'] as const).map((c) => ({
          id: `colours-${c}`, label: c === 'spectrum' ? L.colours.spectrum : C.colours.accent,
          icon: node.attrs.colours === c ? '✓' : undefined, run: () => setHierarchySettings(view, pos, { colours: c }),
        }))],
      },
      { id: 'hi-levels', label: L.levelsTitle, icon: '☰', run: () => openTierEditor(view, pos, new DOMRect(anchor.left, anchor.top, Math.min(anchor.width, 320), 0)) },
    ];
  },
});

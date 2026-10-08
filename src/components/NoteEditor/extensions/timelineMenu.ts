import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { TIMELINE_DESIGNS, TIMELINE_ORDERS, setTimelineSettings, timelinePosAt } from './Timeline';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a timeline: its style and order (the same as the buttons at its top right).
registerContextMenuProvider({
  id: 'note-editor.timeline',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="timeline"]'),
  items: (ctx, scope) => {
    const { editor } = scope.data as NoteEditorMenuApi;
    const view = editor.view;
    const pos = timelinePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.timeline;
    const tick = (on: boolean) => (on ? '✓' : undefined);
    return [
      designMenuItem(TIMELINE_DESIGNS, node.attrs.variant, (v) => setTimelineSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'timeline-order', label: L.sort, icon: '⇅',
        submenu: [TIMELINE_ORDERS.map((o) => ({
          id: `order-${o}`, label: L.orders[o], icon: tick(node.attrs.order === o), run: () => setTimelineSettings(view, pos, { order: o }),
        }))],
      },
    ];
  },
});

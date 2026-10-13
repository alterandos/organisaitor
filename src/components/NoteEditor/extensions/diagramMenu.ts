import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteEditorMenuApi } from '../contextMenu';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { DIAGRAM_DESIGNS, diagramPosAt, setDiagramSettings } from './Diagram';
import type { DiagramKind } from '@/diagrams/diagramSpec';

// Right-click on a diagram's frame (inside, the diagram's own canvas has the clicks): its design and frame.
registerContextMenuProvider({
  id: 'note-editor.diagram',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="diagram"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = diagramPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    return [
      designMenuItem(DIAGRAM_DESIGNS, node.attrs.variant as DiagramKind, (v) => setDiagramSettings(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { ARGUMENT_DESIGNS, ARGUMENT_FIELDS, ARGUMENT_SIDES, argumentPosAt, fieldsOf, setArgumentSides, setArgumentVariant, toggleArgumentField } from './Argument';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in an argument: Sides ▸ (for, against, both), Parts ▸ (each optional part, ticked
// while shown), its design and its frame. A piece of evidence's weight comes from the pros and
// cons menu, which owns the shared points.
registerContextMenuProvider({
  id: 'note-editor.argument',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="argument"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = argumentPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.argument;
    const shown = fieldsOf(node);
    return [
      {
        id: 'arg-sides', label: L.sidesMenu, icon: '⇄',
        submenu: [ARGUMENT_SIDES.map((s) => ({ id: `arg-sides-${s}`, label: L.sides[s], icon: node.attrs.sides === s ? '✓' : undefined, run: () => setArgumentSides(view, pos, s) }))],
      },
      {
        id: 'arg-parts', label: L.partsMenu, icon: '☰',
        submenu: [ARGUMENT_FIELDS.map((f) => ({ id: `arg-part-${f}`, label: L.fields[f], icon: shown.includes(f) ? '✓' : undefined, run: () => toggleArgumentField(view, pos, f) }))],
      },
      designMenuItem(ARGUMENT_DESIGNS, node.attrs.variant, (v) => setArgumentVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

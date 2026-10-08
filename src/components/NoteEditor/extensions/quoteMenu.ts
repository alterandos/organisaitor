import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { QUOTE_DESIGNS, QUOTE_FIELDS, quotePosAt, setQuoteVariant, toggleQuoteField } from './Quote';
import { designMenuItem, frameMenuItem } from './blockDesigns';

// Right-click in a quote: its style and which fields show (the same as the buttons at its top right).
registerContextMenuProvider({
  id: 'note-editor.quote',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="quote"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = quotePosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.quote;
    const shown = new Set<string>();
    node.forEach((child, _o, i) => { if (i > 0) shown.add(child.attrs.field as string); });
    return [
      designMenuItem(QUOTE_DESIGNS, node.attrs.variant, (v) => setQuoteVariant(view, pos, v)),
      frameMenuItem(view, pos, node.attrs),
      {
        id: 'quote-fields', label: L.show, icon: '☰',
        submenu: [QUOTE_FIELDS.map((f) => ({
          id: `field-${f}`, label: L.fields[f], icon: shown.has(f) ? '✓' : undefined, run: () => toggleQuoteField(view, pos, f),
        }))],
      },
    ];
  },
});

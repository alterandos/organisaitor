import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { GLOSSARY_TYPES } from '@/config/structuredTagTypes';
import { glossaryEntry } from '@/services/glossary';
import type { NoteEditorMenuApi } from '../contextMenu';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { GLOSSARY_CARD_DESIGNS_WITH_INLINE, GLOSSARY_CARD_WIDTHS, cardWidth, focusGlossaryCard, glossaryCardPosAt, insertCardAfter, setGlossaryCardVariant, setGlossaryCardWidth, type GlossaryCardDesign } from './GlossaryCard';
import { cardToChip, chipToCard, glossaryChipPosAt, openChip } from './GlossaryChip';

// Right-click on a Glossary card: edit it, its design (Inline makes it a chip) and frame. On a chip:
// open its card, or show it as a card block. On marked text that has a
// Glossary record (a Definition, Concept or Acronym in a sentence): show it as a card too.

registerContextMenuProvider({
  id: 'note-editor.glossary-card',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="glossary-card"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = glossaryCardPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    return [
      { id: 'glossary-card-edit', label: LABELS.glossaryCard.edit, icon: '✎', shortcut: 'Enter', run: () => focusGlossaryCard(view, pos) },
      designMenuItem(GLOSSARY_CARD_DESIGNS_WITH_INLINE, node.attrs.variant as GlossaryCardDesign, (v) => (v === 'inline' ? cardToChip(view, pos) : setGlossaryCardVariant(view, pos, v))),
      {
        id: 'glossary-card-width', label: LABELS.glossaryCard.width, icon: '↔',
        submenu: [GLOSSARY_CARD_WIDTHS.map((w) => ({
          id: `glossary-card-width-${w}`, label: LABELS.glossaryCard.widths[w], icon: cardWidth(node.attrs) === w ? '✓' : undefined,
          run: () => setGlossaryCardWidth(view, pos, w),
        }))],
      },
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

registerContextMenuProvider({
  id: 'note-editor.glossary-mark',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => {
    const id = ctx.target.closest('[data-structured-entry-id]')?.getAttribute('data-structured-entry-id');
    const entry = id ? glossaryEntry(id) : null;
    return !!entry && entry.typeKey in GLOSSARY_TYPES;
  },
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const el = ctx.target.closest('[data-structured-entry-id]')!;
    const entryId = el.getAttribute('data-structured-entry-id')!;
    let pos: number;
    try { pos = view.posAtDOM(el, 0); } catch { return []; }
    return [{
      id: 'glossary-show-as-card', label: LABELS.glossaryCard.showAsCard, icon: '▭',
      run: () => { const tr = insertCardAfter(view.state, pos, entryId); if (tr) view.dispatch(tr); },
    }];
  },
});

registerContextMenuProvider({
  id: 'note-editor.glossary-chip',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="glossary-chip"]'),
  items: (ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const pos = glossaryChipPosAt(view, ctx.target);
    if (pos === null) return [];
    return [
      { id: 'glossary-chip-open', label: LABELS.glossaryCard.edit, icon: '✎', shortcut: 'Enter', run: () => openChip(view, pos) },
      { id: 'glossary-chip-card', label: LABELS.glossaryCard.showAsCard, icon: '▭', run: () => chipToCard(view, pos) },
    ];
  },
});

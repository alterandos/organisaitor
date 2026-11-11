import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { GLOSSARY_KINDS, GLOSSARY_TYPES } from '@/config/structuredTagTypes';
import { changeGlossaryKind, glossaryEntry } from '@/services/glossary';
import { BUILTIN_TAGS } from '../builtinTags';
import type { ContextMenuItem } from '@/contextMenu/types';
import type { NoteEditorMenuApi } from '../contextMenu';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { GLOSSARY_CARD_DESIGNS_WITH_INLINE, focusGlossaryCard, glossaryCardPosAt, insertCardAfter, setGlossaryCardVariant, type GlossaryCardDesign } from './GlossaryCard';
import { widthMenuItem } from './blockWidth';
import { cardToChip, chipToCard, glossaryChipPosAt, openChip } from './GlossaryChip';
import { EditIcon } from '@/components/Icons';
import { cardIconMenuItem } from './cardLook';

// Right-click on a Glossary card: edit it, its design (Inline makes it a chip) and frame. On a chip:
// open its card, or show it as a card block. On marked text that has a
// Glossary record (a Definition, Concept or Acronym in a sentence): show it as a card too. On a card
// or a chip, Change kind ▸ (utils/glossaryKindChange.ts says what moves where).

function changeKindItem(entryId: string | null): ContextMenuItem[] {
  const entry = entryId ? glossaryEntry(entryId) : null;
  if (!entry || entry.locked) return [];
  const kinds = GLOSSARY_KINDS.filter((k) => k !== entry.typeKey).map((k) => BUILTIN_TAGS.find((t) => t.typeKey === k)).filter((t) => !!t);
  return [{
    id: 'glossary-change-kind', label: LABELS.glossaryCard.changeKind,
    submenu: [kinds.map((t) => ({ id: `kind-${t.typeKey}`, label: t.name, icon: t.icon, run: () => { changeGlossaryKind(entry.id, t.typeKey); } }))],
  }];
}

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
      { id: 'glossary-card-edit', label: LABELS.glossaryCard.edit, icon: createElement(EditIcon), shortcut: 'Enter', run: () => focusGlossaryCard(view, pos) },
      designMenuItem(GLOSSARY_CARD_DESIGNS_WITH_INLINE, node.attrs.variant as GlossaryCardDesign, (v) => (v === 'inline' ? cardToChip(view, pos) : setGlossaryCardVariant(view, pos, v))),
      ...changeKindItem(node.attrs.entryId as string | null),
      ...cardIconMenuItem(view, pos, node.attrs),
      widthMenuItem(view, pos, node.attrs, node.attrs.variant === 'card' ? 'auto' : 'full'),
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
      { id: 'glossary-chip-open', label: LABELS.glossaryCard.edit, icon: createElement(EditIcon), shortcut: 'Enter', run: () => openChip(view, pos) },
      { id: 'glossary-chip-card', label: LABELS.glossaryCard.showAsCard, icon: '▭', run: () => chipToCard(view, pos) },
      designMenuItem(GLOSSARY_CARD_DESIGNS_WITH_INLINE, 'inline', (v) => { if (v !== 'inline') chipToCard(view, pos, v); }),
      ...changeKindItem((view.state.doc.nodeAt(pos)?.attrs.entryId as string | null) ?? null),
    ];
  },
});

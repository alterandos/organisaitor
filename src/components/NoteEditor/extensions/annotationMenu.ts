import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { glossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import type { NoteEditorMenuApi } from '../contextMenu';
import { refGroupAt, unlinkConceptRef } from './ConceptRef';
import { collectImportantPassages, setImportance, toggleReview } from './Importance';
import { IMPORTANCE_LEVELS } from './importanceLevels';

// Right-click on text linked to a Glossary term, or on an Important passage.

const posOf = (scope: { data?: unknown }, el: Element): { api: NoteEditorMenuApi; pos: number } | null => {
  const api = scope.data as NoteEditorMenuApi;
  try { return { api, pos: api.editor.view.posAtDOM(el, 0) }; } catch { return null; }
};

registerContextMenuProvider({
  id: 'note-editor.concept-ref',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-concept-ref]'),
  items: (ctx, scope) => {
    const at = posOf(scope, ctx.target.closest('[data-concept-ref]')!);
    if (!at) return [];
    const view = at.api.editor.view;
    const group = refGroupAt(view.state.doc, at.pos);
    if (!group) return [];
    const entry = glossaryEntry(group.entryId);
    const L = LABELS.glossary;
    return [
      { id: 'definition', label: L.goToDefinition, icon: entry?.icon ?? '📖', disabled: !entry, run: () => { if (entry) openNotePassage(entry.noteId, definitionPassage(entry.id)); } },
      { id: 'unlink', label: L.removeLink, icon: '✕', run: () => unlinkConceptRef(view, group) },
    ];
  },
});

registerContextMenuProvider({
  id: 'note-editor.important',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('mark[data-tag-type="important"]'),
  items: (ctx, scope) => {
    const at = posOf(scope, ctx.target.closest('mark[data-tag-type="important"]')!);
    if (!at) return [];
    const view = at.api.editor.view;
    const passage = collectImportantPassages(view.state.doc).find((p) => at.pos >= p.from && at.pos <= p.to);
    if (!passage) return [];
    const I = LABELS.importance;
    return [
      ...IMPORTANCE_LEVELS.map((lv) => ({
        id: `level-${lv.level}`, label: lv.label, icon: passage.level === lv.level ? '✓' : lv.icon,
        run: () => setImportance(view, passage.from, passage.to, lv.level),
      })),
      { id: 'review', label: passage.reviewDue ? I.stopReviewing : I.reviewLater, icon: '🔁', run: () => toggleReview(view, passage.from, passage.to) },
      { id: 'remove', label: LABELS.contextMenu.removeImportant, icon: '✕', run: () => setImportance(view, passage.from, passage.to, null) },
    ];
  },
});

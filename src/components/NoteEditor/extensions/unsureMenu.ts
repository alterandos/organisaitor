import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { flagAt, flagToQuestion, resolveFlag } from './UnsureFlag';

// Right-click on a passage flagged as unsure (extensions/UnsureFlag.ts): Turn into a question (or
// go to it) and Resolved, the clicked thing's actions first. Flag as unsure on selected text is in
// Mark as ▸ (objects/selectionActions.ts).

registerContextMenuProvider({
  id: 'note-editor.unsure-flag',
  kind: 'note-editor',
  order: 5,
  when: (ctx) => !!ctx.target.closest('[data-unsure-flag]'),
  items: (ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const view = api.editor.view;
    let pos: number;
    try { pos = view.posAtDOM(ctx.target.closest('[data-unsure-flag]')!, 0); } catch { return []; }
    const flag = flagAt(view.state.doc, pos);
    if (!flag) return [];
    const L = LABELS.unsureFlag;
    return [
      { id: 'unsure-question', label: flag.qid ? L.goToQuestion : L.toQuestion, icon: '❓', run: () => flagToQuestion(view, flag.flagId) },
      { id: 'unsure-resolve', label: L.resolve, icon: '✓', run: () => resolveFlag(view, flag.flagId) },
    ];
  },
});


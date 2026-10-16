import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { UnsureIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { NoteEditorMenuApi } from '../contextMenu';
import { flagAt, flagRange, flagToQuestion, resolveFlag } from './UnsureFlag';

// Right-click on a passage flagged as unsure (extensions/UnsureFlag.ts): Turn into a question (or
// go to it) and Resolved, the clicked thing's actions first. On selected text that isn't flagged:
// Flag as unsure.

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

registerContextMenuProvider({
  id: 'note-editor.flag-selection',
  kind: 'note-editor',
  order: 8,
  items: (_ctx, scope) => {
    const api = scope.data as NoteEditorMenuApi;
    const { state, view } = api.editor;
    if (state.selection.empty || !api.editor.isEditable) return [];
    const { from, to } = state.selection;
    if (flagAt(state.doc, from) && flagAt(state.doc, to)) return [];
    return [{
      id: 'flag-unsure', label: LABELS.unsureFlag.flag, icon: createElement(UnsureIcon),
      run: () => { const tr = flagRange(view.state.tr, from, to); if (tr) view.dispatch(tr); },
    }];
  },
});

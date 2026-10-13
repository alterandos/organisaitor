import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { GLOSSARY_TYPES } from '@/config/structuredTagTypes';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { QuestionStatus } from '@/utils/noteQuestions';
import type { NoteEditorMenuApi } from '../contextMenu';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { designMenuItem, frameMenuItem } from './blockDesigns';
import { QUESTION_DESIGNS, QUESTION_STATUSES, answerWithCard, openFollowUpPicker, questionPosAt, setQuestionAttrs, setQuestionStatus, type QuestionVariant } from './Question';

// Right-click on a question: its status, follow-up, answer with a card; its design and frame.
registerContextMenuProvider({
  id: 'note-editor.question',
  kind: 'note-editor',
  order: 6,
  when: (ctx) => !!ctx.target.closest('[data-type="question"]'),
  items: (ctx, scope) => {
    const editor = (scope.data as NoteEditorMenuApi).editor;
    const view = editor.view;
    const pos = questionPosAt(view, ctx.target);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return [];
    const L = LABELS.noteBlocks.question;
    const noteCtx = () => objectTriggerStorage(editor).getContext();
    return [
      ...QUESTION_STATUSES.map((s: QuestionStatus) => ({
        id: `question-status-${s}`, label: L.setStatus(L.statuses[s]), icon: node.attrs.status === s ? '✓' : undefined,
        run: () => setQuestionStatus(view, pos, s),
      })),
      { id: 'question-follow-up', label: L.followUp, icon: ITEM_TYPE_ICON.reminder, run: () => openFollowUpPicker(view, pos, ctx.target.getBoundingClientRect(), node.attrs.followUp as string | null, noteCtx) },
      {
        id: 'question-answer-card', label: L.answerWithCardShort, icon: '▭',
        submenu: [Object.keys(GLOSSARY_TYPES).map((typeKey) => ({
          id: `question-answer-${typeKey}`, label: LABELS.noteBlocks[typeKey as 'definition' | 'acronym' | 'concept'].label,
          run: () => answerWithCard(view, pos, typeKey, noteCtx()),
        }))],
      },
      designMenuItem(QUESTION_DESIGNS, node.attrs.variant as QuestionVariant, (v) => setQuestionAttrs(view, pos, { variant: v })),
      frameMenuItem(view, pos, node.attrs),
    ];
  },
});

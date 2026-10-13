import { LABELS } from '@/config/labels';
import { QUESTION_ICON } from '@/config/itemIcons';
import { insertQuestion } from '../extensions/Question';
import type { NoteBlockKind } from './types';

// `\question`: a question (extensions/Question.ts) in place of what was typed, the cursor in it.
export const questionBlock: NoteBlockKind = {
  family:  'block',
  id:      'question',
  label:   LABELS.noteBlocks.question.label,
  icon:    QUESTION_ICON,
  aliases: ['q', 'unknown', 'ask', 'todo-learn', 'find-out'],
  hint:    LABELS.noteBlocks.question.hint,
  insert:  (view, from, to) => {
    const tr = insertQuestion(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

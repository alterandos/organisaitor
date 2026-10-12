import { LABELS } from '@/config/labels';
import { insertCode } from '../extensions/CodeBlock';
import type { NoteBlockKind } from './types';

// `\code`: a code block (extensions/CodeBlock.ts) in place of what was typed. ``` does the same,
// as in Markdown.
export const codeBlock: NoteBlockKind = {
  family:  'block',
  id:      'code',
  label:   LABELS.noteBlocks.code.label,
  icon:    '⌨',
  aliases: ['snippet', 'pre', 'program'],
  hint:    LABELS.noteBlocks.code.hint,
  insert:  (view, from, to) => {
    const tr = insertCode(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

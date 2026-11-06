import { createElement } from 'react';
import { LABELS } from '@/config/labels';
import { ClarifyIcon } from '@/components/Icons';
import { clarifySentenceBefore } from '../extensions/ClarifyMark';
import type { NoteBlockKind } from './types';

// `\clarify`: marks the sentence before it to come back and learn (extensions/ClarifyMark.ts). It
// inserts no block, as `\unsure` doesn't; on selected text, `\` offers "Clarify later" for exactly
// that text (objects/selectionActions.ts).
export const clarifyTrigger: NoteBlockKind = {
  family:  'block',
  category: 'mark',
  id:      'clarify',
  label:   LABELS.clarify.label,
  icon:    createElement(ClarifyIcon),
  aliases: ['learn', 'learnlater', 'clarifylater', 'lookup', 'tolearn'],
  hint:    LABELS.clarify.hint,
  insert:  (view, from, to) => { view.dispatch(clarifySentenceBefore(view.state, from, to)); },
};

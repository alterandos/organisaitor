import { createElement } from 'react';
import { LABELS } from '@/config/labels';
import { UnsureIcon } from '@/components/Icons';
import { flagSentenceBefore } from '../extensions/UnsureFlag';
import type { NoteBlockKind } from './types';

// `\unsure`: flags the sentence before it as unsure (extensions/UnsureFlag.ts). It inserts no
// block: what was typed goes. On selected text, `\` offers "Flag as unsure" for exactly that text
// (SelectionMenu) instead. In the block family only because that's the `\` menu's "Add to the
// note" group, as `\ref` is.
export const unsureTrigger: NoteBlockKind = {
  family:  'block',
  category: 'mark',
  id:      'unsure',
  label:   LABELS.unsureFlag.label,
  icon:    createElement(UnsureIcon),
  aliases: ['flag', 'doubt', 'uncertain', 'verify', 'notsure'],
  hint:    LABELS.unsureFlag.hint,
  insert:  (view, from, to) => { view.dispatch(flagSentenceBefore(view.state, from, to)); },
};

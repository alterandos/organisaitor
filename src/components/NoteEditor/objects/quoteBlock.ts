import { LABELS } from '@/config/labels';
import { insertQuote } from '../extensions/Quote';
import type { NoteBlockKind } from './types';

// `\quote`: a quote (extensions/Quote.ts) in place of what was typed.
export const quoteBlock: NoteBlockKind = {
  family:  'block',
  id:      'quote',
  label:   LABELS.noteBlocks.quote.label,
  icon:    '❝',
  aliases: ['q', 'cite', 'quotation'],
  hint:    LABELS.noteBlocks.quote.hint,
  insert:  (view, from, to) => {
    const tr = insertQuote(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

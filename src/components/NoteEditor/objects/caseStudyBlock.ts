import { LABELS } from '@/config/labels';
import { insertCaseStudy } from '../extensions/CaseStudy';
import type { NoteBlockKind } from './types';

// `\case`: a case study (extensions/CaseStudy.ts) in place of what was typed.
export const caseStudyBlock: NoteBlockKind = {
  family:  'block',
  category: 'structure',
  id:      'case',
  label:   LABELS.noteBlocks.caseStudy.label,
  icon:    '🧪',
  aliases: ['casestudy', 'example', 'study'],
  hint:    LABELS.noteBlocks.caseStudy.hint,
  insert:  (view, from, to) => {
    const tr = insertCaseStudy(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

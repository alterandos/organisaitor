import { LABELS } from '@/config/labels';
import { insertTimeline } from '../extensions/Timeline';
import type { NoteBlockKind } from './types';

// `\timeline`: a timeline (extensions/Timeline.ts) in place of what was typed. Deleting the `\`
// ends the session by itself.
export const timelineBlock: NoteBlockKind = {
  family:  'block',
  id:      'timeline',
  label:   LABELS.noteBlocks.timeline.label,
  icon:    '🕰️',
  aliases: ['tl', 't', 'history'],
  hint:    LABELS.noteBlocks.timeline.hint,
  insert:  (view, from, to) => {
    const tr = insertTimeline(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

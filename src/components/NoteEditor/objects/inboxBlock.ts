import { LABELS } from '@/config/labels';
import { INBOX_ICON } from '@/config/itemIcons';
import { insertInbox } from '../extensions/Inbox';
import type { NoteBlockKind } from './types';

// `\inbox`: an inbox (extensions/Inbox.ts) in place of what was typed, the cursor in its name.
export const inboxBlock: NoteBlockKind = {
  family:  'block',
  id:      'inbox',
  label:   LABELS.noteBlocks.inbox.label,
  icon:    INBOX_ICON,
  aliases: ['ideas', 'dump', 'parking', 'later', 'capture'],
  hint:    LABELS.noteBlocks.inbox.hint,
  insert:  (view, from, to) => {
    const tr = insertInbox(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

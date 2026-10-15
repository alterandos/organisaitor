import { LABELS } from '@/config/labels';
import { HUB_ICON } from '@/config/itemIcons';
import { insertHub } from '../extensions/Hub';
import type { NoteBlockKind } from './types';

// `\hub`: an idea hub (extensions/Hub.ts) in place of what was typed, the cursor in its name.
export const hubBlock: NoteBlockKind = {
  family:  'block',
  category: 'container',
  id:      'hub',
  label:   LABELS.hubs.label,
  icon:    HUB_ICON,
  aliases: ['idea', 'concept-map', 'map', 'connections', 'moc'],
  hint:    LABELS.hubs.hint,
  insert:  (view, from, to) => {
    const tr = insertHub(view.state, from, to);
    if (tr) view.dispatch(tr);
  },
};

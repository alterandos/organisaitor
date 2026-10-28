import type { StreamKind, StreamVisibility } from '@/types';
import { LABELS } from '@/config/labels';

// The kinds of rhythm stream and where each shows by default (docs/features/endeavours.md
// "Visibility defaults by stream kind", agreed with the user 2026-10-28: quiet, so a week isn't
// cluttered). The person changes it per stream; a new kind is one entry here.
export interface StreamKindDef {
  id:    StreamKind;
  label: string;
  hint:  string;
  icon:  string;
  show:  StreamVisibility;
}

export const STREAM_KINDS: Record<StreamKind, StreamKindDef> = {
  // Something you go to (a lecture): the timetable already puts it on the calendar.
  attend: { id: 'attend', label: LABELS.rhythms.kinds.attend, hint: LABELS.rhythms.kindHints.attend, icon: '🏛️',
    show: { calendar: 'none', tasks: 'never', notify: false } },
  // Something to get done by a day (a reading): a small mark on the calendar, in Tasks only when close.
  doBy:   { id: 'doBy',   label: LABELS.rhythms.kinds.doBy,   hint: LABELS.rhythms.kindHints.doBy,   icon: '📖',
    show: { calendar: 'marker', tasks: 'near', notify: false } },
  // Something handed in (a weekly quiz): shown everywhere, like a Deadline.
  submit: { id: 'submit', label: LABELS.rhythms.kinds.submit, hint: LABELS.rhythms.kindHints.submit, icon: '📤',
    show: { calendar: 'item', tasks: 'always', notify: true } },
};

export const STREAM_KIND_LIST: StreamKindDef[] = Object.values(STREAM_KINDS);

// A routine never given streams is read as one stream that shows nowhere new, so nothing about
// an existing routine changes until it's edited.
export const LEGACY_STREAM_SHOW: StreamVisibility = { calendar: 'none', tasks: 'never', notify: false };

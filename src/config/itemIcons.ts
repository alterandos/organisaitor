import type { CrossAppRefType } from '@/types';

// One icon per kind of item, wherever a link, backlink or calendar entry shows one, so the same
// thing always looks the same. Deadline is 🏁 (the finish line: done by here) — not ⏳ (that's a
// waiting task in Tasks), 🚩 (reads as "flagged") or ❗ (that's "important").
export const ITEM_TYPE_ICON: Record<CrossAppRefType, string> = {
  note:         '📝',
  task:         '☑️',
  event:        '📅',
  reminder:     '⏰',
  deadline:     '🏁',
  list:         '📋',
  listItem:     '📃',
  trackerEntry: '📊',
};

// Flags an item can carry, shown as small icons beside it.
export const ITEM_FLAG_ICON = {
  important: '❗',
  tentative: '✏️',   // "pencilled in"
  repeats:   '🔁',
} as const;

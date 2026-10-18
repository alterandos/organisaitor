import type { CrossAppRefType } from '@/types';

// One icon per kind of item, wherever a link, backlink or calendar entry shows one, so the same
// thing always looks the same. Deadline is 🏁 (the finish line: done by here) — not ⏳ (that's a
// waiting task in Tasks), 🚩 (reads as "flagged") or ❗ (that's "important"). A task is 🔨 (a job to do),
// not a ticked box (2026-10-18: beside a task's own checkbox it read as a second one) and not 📌
// (that's pinned to Quick Access).
export const ITEM_TYPE_ICON: Record<CrossAppRefType, string> = {
  note:         '📝',
  task:         '🔨',
  event:        '📅',
  reminder:     '⏰',
  deadline:     '🏁',
  list:         '📋',
  listItem:     '📃',
  trackerEntry: '📊',
};

// An inbox and what's in it (the `\inbox` note block, Send to inbox, the Overview source).
export const INBOX_ICON = '📥';
export const QUESTION_ICON = '❓';
// A question's status, where it shows as an icon (its Compact design).
export const QUESTION_STATUS_ICON = { open: '❓', answered: '✅', dropped: '➖' } as const;

// An idea hub (the `\hub` note block, Add to hub, a passage's place in a hub).
export const HUB_ICON = '🧭';

// A link to another note or a passage of it (`[[`, `\ref`), and an embedded passage (`\embed`).
export const NOTE_LINK_ICON = '🔗';
export const EMBED_ICON = '❞';

// Flags an item can carry, shown as small icons beside it.
export const ITEM_FLAG_ICON = {
  important: '❗',
  tentative: '✏️',   // "pencilled in"
  repeats:   '🔁',
} as const;

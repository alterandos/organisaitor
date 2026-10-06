import { LABELS } from '@/config/labels';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { formatObjectDay, formatRepeatRule } from './format';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import type { ContextMenuItem } from '@/contextMenu/types';
import type { EventStatus, RepeatConfig } from '@/types';

// An on/off option of an item (Important, Tentative, Repeat). One list per kind feeds both places
// they're offered: greyed in the expanded body while off (a click turns it on), and the right-click
// menu (either way). While on, the heading shows its icon.
export interface ArtifactFlag {
  id:       string;
  icon:     string;
  label:    string;
  on:       boolean;
  toggle:   () => void;     // on ⇄ off; for one with choices, used to turn it off. May ask first.
  choices?: { id: string; label: string; on: boolean; run: () => void }[];   // how it's on (Repeat: how often)
}

interface Flagged { title: string; date: string; important: boolean; status: EventStatus; repeat: RepeatConfig | null }
const FREQS: RepeatConfig['freq'][] = ['daily', 'weekly', 'monthly', 'yearly'];

// The flags every calendar item (event, reminder, deadline) has.
export function calendarFlags(item: Flagged | undefined, update: (changes: Partial<Flagged>) => void): ArtifactFlag[] {
  if (!item) return [];
  const C = LABELS.noteObjects.card;
  const simpleRepeat = item.repeat && item.repeat.interval === 1 && item.repeat.endKind === 'forever' ? item.repeat.freq : null;
  return [
    { id: 'important', icon: ITEM_FLAG_ICON.important, label: C.important, on: item.important, toggle: () => update({ important: !item.important }) },
    { id: 'tentative', icon: ITEM_FLAG_ICON.tentative, label: C.tentative, on: item.status === 'tentative', toggle: () => update({ status: item.status === 'tentative' ? 'confirmed' : 'tentative' }) },
    {
      id: 'repeat', icon: ITEM_FLAG_ICON.repeats, label: C.repeat, on: !!item.repeat,
      // Turning repeat off takes every other date of the series off the calendar, so it asks first
      // (the user lost a series to one stray click, 2026-10-06). Changing how often doesn't ask.
      toggle: async () => {
        if (!item.repeat) return;
        const ok = await confirmDialog({
          title:        C.stopRepeatTitle,
          itemName:     item.title,
          message:      C.stopRepeatMessage(formatRepeatRule(item.repeat), formatObjectDay(item.date)),
          confirmLabel: C.stopRepeatConfirm,
          destructive:  true,
        });
        if (ok) update({ repeat: null });
      },
      choices: FREQS.map((f) => ({
        id: f, label: C.repeatFreq[f], on: simpleRepeat === f,
        run: () => update({ repeat: { freq: f, interval: 1, endKind: 'forever', count: null, until: null } }),
      })),
    },
  ];
}

// The flags as right-click entries: a ✓ shows which are on; one with choices is a submenu.
export function flagMenuItems(flags: ArtifactFlag[]): ContextMenuItem[] {
  const C = LABELS.noteObjects.card;
  return flags.map((f) => (f.choices
    ? {
        id: f.id, label: f.label, icon: f.icon,
        submenu: [[
          { id: 'off', label: C.repeatNone, icon: f.on ? '' : '✓', run: () => { if (f.on) f.toggle(); } },
          ...f.choices.map((c) => ({ id: c.id, label: c.label, icon: c.on ? '✓' : '', run: c.run })),
        ]],
      }
    : { id: f.id, label: f.label, icon: f.on ? '✓' : f.icon, run: f.toggle }));
}

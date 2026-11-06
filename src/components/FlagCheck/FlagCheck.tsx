import type { ReactNode } from 'react';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import styles from './FlagCheck.module.css';

// One of an item's options as a checkbox with its flag's icon (Important ❗, Tentative ✏️, Repeat 🔁,
// Notify 🔔, Show quieter 🔅): the icon the item shows wherever it's drawn (config/itemIcons.ts), so
// the option and the item read the same. Used by every creation form and item pane (2026-11-05).
export type ItemFlag = keyof typeof ITEM_FLAG_ICON;

export function FlagCheck({ flag, checked, onChange, children, className }: {
  flag: ItemFlag; checked: boolean; onChange: (on: boolean) => void; children: ReactNode; className?: string;
}) {
  return (
    <label className={className ?? styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <FlagIcon flag={flag} />
      {children}
    </label>
  );
}

// The flag's icon alone, for a label that isn't a FlagCheck (RepeatField, NotifyRuleField).
export function FlagIcon({ flag }: { flag: ItemFlag }) {
  return <span className={styles.icon} aria-hidden="true">{ITEM_FLAG_ICON[flag]}</span>;
}

import type { ReactNode } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import styles from './CalendarView.module.css';

// THE way a calendar item's line is drawn, in every view (2026-11-06: each view laid out its time,
// flags, icon and title by hand, and they drifted, so ❗ and 🔁 showed twice in the month view).
// The order (CLAUDE.md "Kinds of event…"): what it is (its icon) before its title; what the app adds
// about it (❗ important, 🔁 repeats), small and quiet, after its time, or after its title when it
// has none.
export interface CalLineItem {
  title:        string;
  typeIcon:     string;
  pictureIcon?: string | null;
  flags?:       string;
}

// Its icon alone: the multi-day and background bars, which have no time or flags of their own.
export function CalItemIcon({ item }: { item: Pick<CalLineItem, 'typeIcon' | 'pictureIcon'> }) {
  if (!item.typeIcon && !item.pictureIcon) return null;
  return (
    <span className={styles.calItemIcon} aria-hidden="true">
      {item.pictureIcon && <ItemIcon icon={item.pictureIcon} className={styles.calItemPicture} />}{item.typeIcon}
    </span>
  );
}

function Flags({ item }: { item: CalLineItem }) {
  return item.flags ? <span className={styles.calItemFlags} aria-hidden="true">{item.flags}</span> : null;
}

// One line: [time flags] icon title [flags]. `time` is what to show, already formatted (or null).
export function CalItemLine({ item, time, titleClassName }: { item: CalLineItem; time: ReactNode | null; titleClassName?: string }) {
  return (
    <>
      {time && <span className={styles.calItemTime}>{time}</span>}
      {time && <Flags item={item} />}
      <CalItemIcon item={item} />
      <span className={titleClassName}>{item.title}</span>
      {!time && <Flags item={item} />}
    </>
  );
}

// A timed block in the week and day grids: the time (and the flags) on its own line, then the
// icon and title. `time` is the block's time, already drawn.
export function CalItemBlock({ item, time }: { item: CalLineItem; time: ReactNode }) {
  return (
    <>
      <span className={styles.weekTimeBlockTime}>{time}<Flags item={item} /></span>
      <span className={styles.weekTimeBlockTitle}><CalItemIcon item={item} />{item.title}</span>
    </>
  );
}

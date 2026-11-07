import { endeavourChain } from '@/utils/endeavourGraph';
import { endeavourColor } from '@/utils/endeavourLook';
import { createPortal } from 'react-dom';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { formatDate, formatTime } from '@/utils/date';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import type { CalendarEventId, CollectionId } from '@/types';
import type { DuringItem } from '@/utils/calendarItems';
import styles from './CalendarView.module.css';

// What the card needs from a calendar entry; the event's end, end date and place are read from
// the store, since the entry drawn on the grid doesn't carry them.
export interface HoverCardItem {
  kind:         'task' | 'event' | 'reminder' | 'deadline' | 'schedule' | 'rhythm';
  id:           string;
  title:        string;
  typeIcon:     string;
  flags?:       string;   // ❗ 🔁, after the time
  time:         string | null;
  endTime?:     string | null;
  location?:    string | null;
  date:         string | null;
  notes:        string | null;
  links:        string[];
  collectionId: CollectionId | null;
}

// An entry squeezed into a calendar cell, shown whole while hovered (2026-10-19): title, when,
// where, Endeavour, notes and links. Desktop only: there's no hover on a phone, where a tap opens
// the item's pane with all of it.
// A class with items during it (an in-class quiz) shows them side by side, each a button: the card
// stays while the pointer is on it, and a click opens that one (the user, 2026-11-07).
export interface DuringCard {
  items:      DuringItem[];
  classTitle: string;
  onOpen:     (kind: 'event' | 'deadline', id: string, date: string | null) => void;
  onEnter:    () => void;
  onLeave:    () => void;
}

export function CalendarItemHoverCard({ item, anchor, during }: { item: HoverCardItem; anchor: AnchorBox; during?: DuringCard }) {
  const event       = useCalendarStore((s) => (item.kind === 'event' ? s.events[item.id as CalendarEventId] : undefined));
  const collections = useTaskStore((s) => s.collections);
  const collection  = item.collectionId ? collections[item.collectionId] : undefined;
  const colour      = endeavourColor(item.collectionId, collections);
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 6 });

  const endTime  = item.endTime ?? event?.endTime ?? null;
  const endDate  = event?.endDate && event.endDate !== item.date ? event.endDate : null;
  const location = item.location ?? event?.location ?? null;
  const when = [
    item.date ? formatDate(`${item.date}T00:00:00`) : null,
    item.time ? formatTime(item.time, clockFormat) + (endTime ? ` – ${formatTime(endTime, clockFormat)}` : '') : null,
  ].filter(Boolean).join(' · ') + (endDate ? ` → ${formatDate(`${endDate}T00:00:00`)}` : '');

  if (during) {
    const timeOf = (t: string | null, end?: string | null) => (t ? formatTime(t, clockFormat) + (end ? ` – ${formatTime(end, clockFormat)}` : '') : '');
    return createPortal(
      <div ref={ref} className={`${styles.hoverTooltip} ${styles.duringCard}`} style={{ ...style, ...(colour ? { borderColor: colour } : {}) }}
        role="dialog" aria-label={LABELS.calendarDuring.title} onMouseEnter={during.onEnter} onMouseLeave={during.onLeave}>
        <span className={styles.tooltipWhen}>{LABELS.calendarDuring.title}</span>
        <div className={styles.duringRow}>
          <button type="button" className={styles.duringPick} onClick={() => during.onOpen('event', item.id, item.date)}>
            <span className={styles.tooltipTitle}>{during.classTitle}</span>
            <span className={styles.tooltipWhen}>{timeOf(item.time, endTime)}</span>
          </button>
          {during.items.map((d) => (
            <button key={d.id} type="button" className={`${styles.duringPick} ${styles.duringPickInner}`} onClick={() => during.onOpen(d.kind, d.id, item.date)}>
              <span className={styles.tooltipTitle}>📌 {d.title}</span>
              <span className={styles.tooltipWhen}>{timeOf(d.time, d.endTime)}</span>
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div ref={ref} className={styles.hoverTooltip} style={{ ...style, ...(colour ? { borderColor: colour } : {}) }} role="tooltip">
      <span className={styles.tooltipTitle}>
        {item.typeIcon && <span aria-hidden>{item.typeIcon} </span>}
        {item.title}
      </span>
      {when && <span className={styles.tooltipWhen}>{when}{item.flags && <span aria-hidden> {item.flags}</span>}</span>}
      {location && <span className={styles.tooltipWhen}>📍 {location}</span>}
      {collection && (
        <span className={styles.tooltipCollection} style={colour ? { color: colour } : undefined}>
          {LABELS.collection}: {endeavourChain(collection.id, collections).map((c) => c.name).join(' · ')}
        </span>
      )}
      {item.notes && <span className={styles.tooltipNotes}>{item.notes}</span>}
      {item.links.length > 0 && (
        <span className={styles.tooltipLinks}>
          {item.links.map((link) => <span key={link} className={styles.tooltipLink}>{link}</span>)}
        </span>
      )}
    </div>,
    document.body,
  );
}

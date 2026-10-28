import { createPortal } from 'react-dom';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { formatDate, formatTime } from '@/utils/date';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import type { CalendarEventId, CollectionId } from '@/types';
import styles from './CalendarView.module.css';

// What the card needs from a calendar entry; the event's end, end date and place are read from
// the store, since the entry drawn on the grid doesn't carry them.
export interface HoverCardItem {
  kind:         'task' | 'event' | 'reminder' | 'deadline' | 'schedule' | 'rhythm';
  id:           string;
  title:        string;
  typeIcon:     string;
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
export function CalendarItemHoverCard({ item, anchor }: { item: HoverCardItem; anchor: AnchorBox }) {
  const event       = useCalendarStore((s) => (item.kind === 'event' ? s.events[item.id as CalendarEventId] : undefined));
  const collection  = useTaskStore((s) => (item.collectionId ? s.collections[item.collectionId] : undefined));
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 6 });

  const endTime  = item.endTime ?? event?.endTime ?? null;
  const endDate  = event?.endDate && event.endDate !== item.date ? event.endDate : null;
  const location = item.location ?? event?.location ?? null;
  const when = [
    item.date ? formatDate(`${item.date}T00:00:00`) : null,
    item.time ? formatTime(item.time, clockFormat) + (endTime ? ` – ${formatTime(endTime, clockFormat)}` : '') : null,
  ].filter(Boolean).join(' · ') + (endDate ? ` → ${formatDate(`${endDate}T00:00:00`)}` : '');

  return createPortal(
    <div ref={ref} className={styles.hoverTooltip} style={{ ...style, ...(collection?.color ? { borderColor: collection.color } : {}) }} role="tooltip">
      <span className={styles.tooltipTitle}>
        {item.typeIcon && <span aria-hidden>{item.typeIcon} </span>}
        {item.title}
      </span>
      {when && <span className={styles.tooltipWhen}>{when}</span>}
      {location && <span className={styles.tooltipWhen}>📍 {location}</span>}
      {collection && (
        <span className={styles.tooltipCollection} style={collection.color ? { color: collection.color } : undefined}>
          {LABELS.collection}: {collection.name}
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

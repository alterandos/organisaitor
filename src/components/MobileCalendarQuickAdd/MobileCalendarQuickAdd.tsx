import { useEffect, useRef, useState } from 'react';
import type { CalendarItemKind } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import styles from './MobileCalendarQuickAdd.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';

// Android-only quick-add sheet for calendar events/reminders (docs/android/02-calendar-app.md
// §3) — a genuinely separate, faster component from AddCalendarItemModal, same rationale as
// Tasks' MobileQuickAddBar (Phase 1). Minimal fields by design: title, kind, date, time.
export function MobileCalendarQuickAdd() {
  const open   = useUIStore((s) => s.calendarQuickAddOpen);
  const date   = useUIStore((s) => s.calendarQuickAddDate);
  const prefillTime = useUIStore((s) => s.calendarQuickAddTime);
  const prefillKind = useUIStore((s) => s.calendarQuickAddKind);
  const close  = useUIStore((s) => s.closeCalendarQuickAdd);
  const showAddCalendarItem = useUIStore((s) => s.showAddCalendarItem);
  const activeCollectionId  = useUIStore(selectActiveCollectionId);

  const addEvent    = useCalendarStore((s) => s.addEvent);
  const addReminder = useCalendarStore((s) => s.addReminder);

  // App.tsx mounts this only while open, so the form initialises from the prefill on every open.
  const [title, setTitle] = useState('');
  const [kind, setKind]   = useState<CalendarItemKind>(prefillKind);
  const [itemDate, setItemDate] = useState(date ?? '');
  const [time, setTime]   = useState(prefillTime ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEscapeClose(close, open);
  useCtrlEnterSubmit(() => submit(), open);

  if (!open) return null;

  function submit() {
    if (!title.trim() || !itemDate) return;
    if (kind === 'event') {
      addEvent({
        title: title.trim(),
        date: itemDate,
        startTime: time || null,
        collectionId: activeCollectionId as never ?? null,
      });
    } else {
      addReminder({
        title: title.trim(),
        date: itemDate,
        time: time || null,
        collectionId: activeCollectionId as never ?? null,
      });
    }
    close();
  }

  const handleMoreOptions = () => {
    showAddCalendarItem(itemDate, kind, time || undefined, title);
    close();
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.kindToggle}>
            <button
              type="button"
              className={`${styles.kindBtn} ${kind === 'event' ? styles.kindBtnActive : ''}`}
              onClick={() => setKind('event')}
            >Event</button>
            <button
              type="button"
              className={`${styles.kindBtn} ${kind === 'reminder' ? styles.kindBtnActive : ''}`}
              onClick={() => setKind('reminder')}
            >Reminder</button>
          </div>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close">✕</button>
        </div>

        <input
          ref={inputRef}
          className={styles.titleInput}
          placeholder={kind === 'event' ? 'Event title…' : 'Reminder title…'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />

        <div className={styles.row}>
          <input
            type="date"
            className={styles.dateInput}
            value={itemDate}
            onChange={(e) => setItemDate(e.target.value)}
          />
          <TimeInput className={styles.timeInput} value={time} onChange={setTime} placeholder="Time (optional)" />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.moreBtn} onClick={handleMoreOptions}>More options…</button>
          <button type="button" className={styles.submitBtn} onClick={submit} disabled={!title.trim()}>
            Add {kind === 'event' ? 'Event' : 'Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

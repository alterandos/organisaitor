import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime, formatDate } from '@/utils/date';
import type { ScheduleId } from '@/types';
import styles from './ScheduleOccurrencePopover.module.css';

interface Props {
  scheduleId: ScheduleId;
  blockId:    string;
  date:       string;
  title:      string;
  startTime:  string;
  endTime:    string;
  location:   string | null;
  x: number;
  y: number;
  onClose: () => void;
}

// Small anchored popover for a single Schedule occurrence rendered on the real calendar —
// lets the user skip just this date (adds it to the block's exception list, the same "EXDATE"
// mechanism the ICS import already uses) or jump to editing the schedule itself, without
// pretending a virtual, template-sourced occurrence is a real editable CalendarEvent.
export function ScheduleOccurrencePopover({ scheduleId, blockId, date, title, startTime, endTime, location, x, y, onClose }: Props) {
  const schedule       = useScheduleStore((s) => s.schedules[scheduleId]);
  const addException   = useScheduleStore((s) => s.addException);
  const openEditSchedule = useUIStore((s) => s.openEditSchedule);
  const clockFormat    = useSettingsStore((s) => s.clockFormat);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleSkip = () => {
    addException(scheduleId, blockId, date);
    onClose();
  };

  const handleEdit = () => {
    if (schedule) openEditSchedule(schedule);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className={styles.popover}
      style={{ left: x, top: y }}
    >
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.time}>{formatDate(date)} · {formatTime(startTime, clockFormat)}–{formatTime(endTime, clockFormat)}</span>
        {location && <span className={styles.location}>📍 {location}</span>}
      </div>
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={handleSkip}>Skip this occurrence</button>
        <button className={styles.actionBtnSecondary} onClick={handleEdit}>Edit schedule…</button>
      </div>
    </div>,
    document.body
  );
}

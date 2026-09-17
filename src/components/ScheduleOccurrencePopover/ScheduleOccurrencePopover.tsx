import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime, formatDate } from '@/utils/date';
import { computeNextOccurrenceDates } from '@/utils/scheduleOccurrences';
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
// mechanism the ICS import already uses), commit/uncommit it (see ScheduleBlock.
// requiresCommitment — "Schedule commitment mode" in CLAUDE.md), or jump to editing the
// schedule itself, without pretending a virtual, template-sourced occurrence is a real
// editable CalendarEvent.
export function ScheduleOccurrencePopover({ scheduleId, blockId, date, title, startTime, endTime, location, x, y, onClose }: Props) {
  const schedule         = useScheduleStore((s) => s.schedules[scheduleId]);
  const addException     = useScheduleStore((s) => s.addException);
  const commitOccurrences  = useScheduleStore((s) => s.commitOccurrences);
  const uncommitOccurrence = useScheduleStore((s) => s.uncommitOccurrence);
  const openEditSchedule = useUIStore((s) => s.openEditSchedule);
  const clockFormat      = useSettingsStore((s) => s.clockFormat);
  const ref = useRef<HTMLDivElement>(null);
  const [weeksToCommit, setWeeksToCommit] = useState(4);

  const block = schedule?.blocks.find((b) => b.id === blockId) ?? null;
  const requiresCommitment = block?.requiresCommitment ?? false;
  const isCommitted = requiresCommitment && (block?.committedDates ?? []).includes(date);

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

  const handleCommitOne = () => {
    commitOccurrences(scheduleId, blockId, [date]);
    onClose();
  };

  const handleUncommit = () => {
    uncommitOccurrence(scheduleId, blockId, date);
    onClose();
  };

  const handleCommitWeeks = () => {
    if (!schedule || !block) return;
    const rest = computeNextOccurrenceDates(block, schedule, date, Math.max(1, weeksToCommit - 1));
    commitOccurrences(scheduleId, blockId, [date, ...rest]);
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

      {requiresCommitment && (
        <div className={styles.commitSection}>
          {isCommitted ? (
            <button className={styles.actionBtn} onClick={handleUncommit}>✓ Committed — click to undo</button>
          ) : (
            <>
              <button className={styles.actionBtn} onClick={handleCommitOne}>Commit to this occurrence</button>
              <div className={styles.commitWeeksRow}>
                <button type="button" className={styles.actionBtnSecondary} onClick={handleCommitWeeks}>
                  Commit for next
                </button>
                <input
                  type="number"
                  className={styles.weeksInput}
                  min={1}
                  max={52}
                  value={weeksToCommit}
                  onChange={(e) => setWeeksToCommit(Math.max(1, Number(e.target.value) || 1))}
                />
                <span className={styles.weeksLabel}>week{weeksToCommit !== 1 ? 's' : ''}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.actionBtnSecondary} onClick={handleSkip}>Skip this occurrence</button>
        <button className={styles.actionBtnSecondary} onClick={handleEdit}>Edit schedule…</button>
      </div>
    </div>,
    document.body
  );
}

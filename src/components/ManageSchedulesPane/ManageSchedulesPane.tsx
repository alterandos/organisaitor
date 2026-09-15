import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/date';
import { countTemplateConflicts } from '@/utils/scheduleOccurrences';
import { ScheduleWeekGridPreview, type PreviewEntry } from '@/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview';
import type { ScheduleId, ScheduleTemplate } from '@/types';
import styles from './ManageSchedulesPane.module.css';

function templatesToPreviewEntries(templates: ScheduleTemplate[]): PreviewEntry[] {
  return templates.flatMap((template) =>
    template.blocks.map((block) => ({
      key: `${template.id}:${block.id}`,
      title: block.title,
      daysOfWeek: block.daysOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      color: template.color,
      groupLabel: template.name,
    }))
  );
}

export function ManageSchedulesPane() {
  const schedulesOpen  = useUIStore((s) => s.schedulesOpen);
  const closeSchedules = useUIStore((s) => s.closeSchedules);
  const showAddSchedule = useUIStore((s) => s.showAddSchedule);
  const openEditSchedule = useUIStore((s) => s.openEditSchedule);
  const openModal        = useUIStore((s) => s.openModal);

  const schedulesRecord = useScheduleStore((s) => s.schedules);
  const toggleActive    = useScheduleStore((s) => s.toggleScheduleActive);
  const deleteSchedule  = useScheduleStore((s) => s.deleteSchedule);
  const clockFormat     = useSettingsStore((s) => s.clockFormat);

  const [previewIds, setPreviewIds] = useState<Set<ScheduleId>>(new Set());

  useEffect(() => {
    if (!schedulesOpen) return;
    // Guarded on openModal: AddScheduleModal can open on top of this pane (editing/creating a
    // schedule from here), and it has its own Escape handler — without this check, one Escape
    // press would close both layers at once instead of just the topmost one.
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModal !== 'add-schedule') closeSchedules();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [schedulesOpen, closeSchedules, openModal]);

  const schedules = useMemo(
    () => Object.values(schedulesRecord).sort((a, b) => a.name.localeCompare(b.name)),
    [schedulesRecord]
  );

  const togglePreview = (id: ScheduleId) =>
    setPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const previewTemplates = schedules.filter((s) => previewIds.has(s.id));
  const previewEntries = useMemo(() => templatesToPreviewEntries(previewTemplates), [previewTemplates]);

  if (!schedulesOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={closeSchedules} />
      <aside className={styles.pane} role="complementary" aria-label="Schedules">
        <div className={styles.header}>
          <span className={styles.heading}>Schedules</span>
          <button className={styles.closeBtn} onClick={closeSchedules} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            A Schedule is a recurring weekly timetable (a class schedule, a gym timetable) that can be switched
            on and off as a layer over your calendar. Check "Preview" on a few below to compare them before turning any on.
          </p>

          {schedules.length === 0 ? (
            <p className={styles.empty}>No schedules yet.</p>
          ) : (
            <div className={styles.list}>
              {schedules.map((schedule) => {
                const conflicts = countTemplateConflicts(schedule, schedules.filter((s) => s.active));
                return (
                  <div key={schedule.id} className={styles.row}>
                    <label className={styles.activeToggle} title="Show on the real calendar">
                      <input type="checkbox" checked={schedule.active} onChange={() => toggleActive(schedule.id)} />
                    </label>
                    <span className={styles.swatch} style={{ background: schedule.color ?? 'var(--color-border)' }} />
                    <div className={styles.rowMain}>
                      <span className={styles.rowName}>{schedule.name}</span>
                      <span className={styles.rowMeta}>
                        {schedule.blocks.length} block{schedule.blocks.length !== 1 ? 's' : ''}
                        {schedule.startDate && ` · from ${formatDate(schedule.startDate)}`}
                        {schedule.endDate && ` to ${formatDate(schedule.endDate)}`}
                        {schedule.active && conflicts > 0 && (
                          <span className={styles.conflictBadge}> · ⚠ {conflicts} potential conflict{conflicts !== 1 ? 's' : ''}</span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.previewToggle} ${previewIds.has(schedule.id) ? styles.previewToggleActive : ''}`}
                      onClick={() => togglePreview(schedule.id)}
                      title="Preview this schedule below"
                    >
                      👁
                    </button>
                    <button type="button" className={styles.rowActionBtn} onClick={() => openEditSchedule(schedule)} title="Edit">✏️</button>
                    <button
                      type="button"
                      className={`${styles.rowActionBtn} ${styles.rowActionBtnDelete}`}
                      onClick={() => { if (window.confirm(`Delete "${schedule.name}"?`)) deleteSchedule(schedule.id); }}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button className={styles.addBtn} onClick={showAddSchedule}>+ Add Schedule</button>

          {previewTemplates.length > 0 && (
            <div className={styles.previewSection}>
              <div className={styles.previewHeader}>
                <span className={styles.label}>Preview</span>
                <span className={styles.schemaMeta}>{previewTemplates.map((t) => t.name).join(' + ')}</span>
              </div>
              <ScheduleWeekGridPreview entries={previewEntries} />
              <p className={styles.hint}>
                Side-by-side blocks mean overlapping times — the same visual you'll see on the real calendar once both are active.
                Times shown as {clockFormat === '24h' ? '24-hour' : clockFormat === '12h' ? '12-hour' : 'system'} format.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

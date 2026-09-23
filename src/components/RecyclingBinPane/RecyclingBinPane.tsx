import { useMemo, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useTrashStore } from '@/store/trashStore';
import { restoreFromTrash, deleteForever } from '@/services/trash';
import { confirmDelete, confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { formatRelativeTime } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import type { TrashEntry, TrashEntryId } from '@/types/trash';
import styles from './RecyclingBinPane.module.css';

// Display labels for each kind's badge — kept local rather than in config/labels.ts, since
// most of these entities (Calendar event, Note, Schedule, …) have no existing singular
// display label elsewhere in the app to share; the ones that do (Endeavour, Tracker entry,
// List, …) reuse LABELS so a rename there stays reflected here too.
const KIND_LABELS: Record<TrashEntry['kind'], string> = {
  task:               'Task',
  collection:         LABELS.collection,
  tag:                'Tag',
  purpose:            'Purpose',
  calendarEvent:      'Calendar event',
  calendarReminder:   'Calendar reminder',
  schedule:           'Schedule',
  trackerEntry:       LABELS.trackerEntry,
  list:               LABELS.list,
  listItem:           LABELS.listItem,
  listType:           LABELS.listType,
  note:               'Note',
  noteTag:            'Note tag',
  structuredTagEntry: 'Structured entry',
  watchlistItem:      LABELS.watchlistItem,
  portfolioTag:       LABELS.portfolioTag,
  investmentPurpose:  LABELS.investmentPurpose,
  activity:           LABELS.activity,
  activityType:       'Activity type',
};

export function RecyclingBinPane() {
  const closeRecyclingBin = useUIStore((s) => s.closeRecyclingBin);
  const entries = useTrashStore((s) => s.entries);
  const [filter, setFilter] = useState<string | null>(null);

  useEscapeClose(closeRecyclingBin);

  const all = useMemo(
    () => Object.values(entries).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    [entries]
  );
  const sections = useMemo(() => [...new Set(all.map((e) => e.sourceSection))], [all]);
  const visible = filter ? all.filter((e) => e.sourceSection === filter) : all;

  const handleDeleteForever = async (entry: TrashEntry) => {
    const ok = await confirmDelete(KIND_LABELS[entry.kind].toLowerCase(), entry.title);
    if (ok) deleteForever(entry.id);
  };

  const handleEmpty = async () => {
    const ok = await confirmDialog({
      title:        LABELS.recyclingBin.emptyBinTitle,
      message:      LABELS.recyclingBin.emptyBinMessage,
      irreversible: true,
      destructive:  true,
      confirmLabel: LABELS.recyclingBin.emptyBinConfirm,
    });
    if (ok) useTrashStore.getState().clear();
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeRecyclingBin(); }}>
      <div className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.title}>{LABELS.recyclingBin.title}</span>
          <button className={styles.closeBtn} onClick={closeRecyclingBin} aria-label="Close">✕</button>
        </header>

        <div className={styles.body}>
          {sections.length > 1 && (
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.filterChip} ${filter === null ? styles.filterChipActive : ''}`}
                onClick={() => setFilter(null)}
              >{LABELS.recyclingBin.filterAll}</button>
              {sections.map((section) => (
                <button
                  key={section}
                  type="button"
                  className={`${styles.filterChip} ${filter === section ? styles.filterChipActive : ''}`}
                  onClick={() => setFilter(section)}
                >{section}</button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <p className={styles.empty}>
              {filter ? LABELS.recyclingBin.emptyFiltered(filter) : LABELS.recyclingBin.empty}
            </p>
          ) : (
            <ul className={styles.list}>
              {visible.map((entry) => (
                <li key={entry.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{entry.title}</span>
                    <span className={styles.rowMeta}>
                      {KIND_LABELS[entry.kind]}
                      {entry.contextLine ? ` · ${entry.contextLine}` : ''}
                      {' · Deleted '}{formatRelativeTime(entry.deletedAt)}{' '}
                      {entry.deletedBy.type === 'user' ? LABELS.recyclingBin.deletedByYou : 'by an assistant'}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.restoreBtn}
                      onClick={() => restoreFromTrash(entry.id as TrashEntryId)}
                    >{LABELS.recyclingBin.restore}</button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteForever(entry)}
                    >{LABELS.recyclingBin.deleteForever}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {all.length > 0 && (
            <button type="button" className={styles.emptyBinBtn} onClick={handleEmpty}>
              {LABELS.recyclingBin.emptyBinButton}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

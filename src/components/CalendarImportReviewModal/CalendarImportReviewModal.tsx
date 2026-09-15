import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEventType, CollectionId } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { formatDate } from '@/utils/date';
import styles from './CalendarImportReviewModal.module.css';

export interface ReviewRow {
  key:         string;
  title:       string;
  date:        string;
  startTime:   string | null;
  endTime:     string | null;
  location:    string | null;
  eventType:   CalendarEventType;
  isDuplicate: boolean;
}

interface Props {
  rows:      ReviewRow[];
  onConfirm: (selected: ReviewRow[], collectionId: CollectionId | null) => void;
  onCancel:  () => void;
}

export function CalendarImportReviewModal({ rows: initialRows, onConfirm, onCancel }: Props) {
  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections    = Object.values(collectionsRecord);

  const [rows, setRows] = useState(
    initialRows.map((r) => ({ ...r, selected: !r.isDuplicate }))
  );
  const [collectionId, setCollectionId] = useState<CollectionId | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected   = rows.length > 0 && selectedCount === rows.length;

  const toggleRow = (key: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));

  const setRowType = (key: string, eventType: CalendarEventType) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, eventType } : r)));

  const toggleAll = () =>
    setRows((rs) => rs.map((r) => ({ ...r, selected: !allSelected })));

  const handleConfirm = () => {
    onConfirm(rows.filter((r) => r.selected), collectionId);
  };

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Review import — {rows.length} event{rows.length !== 1 ? 's' : ''} found</span>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.selectAll}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {selectedCount} of {rows.length} selected
          </label>

          <div className={styles.collectionRow}>
            <span className={styles.collectionLabel}>Add to Endeavour:</span>
            <CollectionPicker
              collections={allCollections}
              value={collectionId}
              onChange={setCollectionId}
              noneLabel="None"
            />
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}></th>
                <th>Title</th>
                <th>Date</th>
                <th>Time</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.isDuplicate ? styles.duplicateRow : ''}>
                  <td className={styles.checkCol}>
                    <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.key)} />
                  </td>
                  <td className={styles.titleCell}>
                    {r.title}
                    {r.isDuplicate && <span className={styles.dupBadge}>already in calendar</span>}
                    {r.location && <span className={styles.locationHint}>📍 {r.location}</span>}
                  </td>
                  <td className={styles.nowrap}>{formatDate(r.date)}</td>
                  <td className={styles.nowrap}>{r.startTime ?? 'All day'}</td>
                  <td>
                    <select
                      className={styles.typeSelect}
                      value={r.eventType}
                      onChange={(e) => setRowType(r.key, e.target.value as CalendarEventType)}
                    >
                      <option value="default">Event</option>
                      <option value="birthday">Birthday</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={selectedCount === 0}>
            Import {selectedCount} selected
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

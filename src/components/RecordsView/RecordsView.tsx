import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import type { Collection, CollectionId, FieldSchema, TrackerEntry, TrackerEntryId } from '@/types';
import { RoutineChecklist } from '@/components/RoutineChecklist/RoutineChecklist';
import styles from './RecordsView.module.css';

function formatFieldValue(schema: FieldSchema, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  switch (schema.type) {
    case 'boolean': return value ? 'Yes' : 'No';
    case 'rating': {
      const n = Number(value);
      const max = schema.max ?? 5;
      return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
    }
    case 'duration': {
      const total = Number(value);
      if (!total) return '—';
      const h = Math.floor(total / 60);
      const m = total % 60;
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    }
    default: return String(value);
  }
}

interface EntryRowProps {
  entry:    TrackerEntry;
  schema:   FieldSchema[];
  onEdit:   (id: string) => void;
  onDelete: (id: string) => void;
  hasNotes: boolean;
}

function EntryRow({ entry, schema, onEdit, onDelete, hasNotes }: EntryRowProps) {
  return (
    <div className={styles.entryRow}>
      <span className={styles.entryDate}>{entry.date}</span>
      <div className={styles.entryFields}>
        {schema.map((f) => (
          <span key={f.id} className={styles.entryCell}>
            <span className={styles.entryCellLabel}>{f.name}</span>
            <span className={styles.entryCellValue}>{formatFieldValue(f, entry.data[f.id])}</span>
          </span>
        ))}
        {hasNotes && (
          <span className={styles.entryCell}>
            <span className={styles.entryCellLabel}>Notes</span>
            <span className={styles.entryCellValue}>{entry.notes || '—'}</span>
          </span>
        )}
      </div>
      <div className={styles.entryActions}>
        <button className={styles.entryBtn} onClick={() => onEdit(entry.id)} title="Edit">✎</button>
        <button className={`${styles.entryBtn} ${styles.entryBtnDelete}`} onClick={() => onDelete(entry.id)} title="Delete">✕</button>
      </div>
    </div>
  );
}

interface TrackerDetailProps {
  tracker: Collection;
}

function TrackerDetail({ tracker }: TrackerDetailProps) {
  const entries       = useTrackerStore((s) => s.entries);
  const deleteEntry   = useTrackerStore((s) => s.deleteEntry);
  const showAddEntry  = useUIStore((s) => s.showAddEntry);
  const openEditEntry = useUIStore((s) => s.openEditEntry);

  const trackerEntries = Object.values(entries)
    .filter((e) => e.trackerId === tracker.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const hasAnyNotes = trackerEntries.some((e) => e.notes);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          {tracker.color && (
            <span className={styles.detailDot} style={{ background: tracker.color }} />
          )}
          <h2 className={styles.detailTitle}>{tracker.name}</h2>
        </div>
        <button className={styles.addEntryBtn} onClick={() => showAddEntry(tracker.id)}>
          + Add entry
        </button>
      </div>

      {tracker.fieldSchema.length === 0 ? (
        <p className={styles.emptyHint}>
          This tracker has no fields defined. Use the ✎ button in the sidebar to add fields.
        </p>
      ) : trackerEntries.length === 0 ? (
        <p className={styles.emptyHint}>No entries yet. Add your first entry above.</p>
      ) : (
        <div className={styles.entriesTable}>
          <div className={styles.tableHead}>
            <span className={styles.headDate}>Date</span>
            {tracker.fieldSchema.map((f) => (
              <span key={f.id} className={styles.headCell}>{f.name}</span>
            ))}
            {hasAnyNotes && <span className={styles.headCell}>Notes</span>}
            <span className={styles.headActions} />
          </div>
          {trackerEntries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              schema={tracker.fieldSchema}
              onEdit={openEditEntry}
              onDelete={(id) => deleteEntry(id as TrackerEntryId)}
              hasNotes={hasAnyNotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RecordsView() {
  const collections      = useTaskStore((s) => s.collections);
  const deleteCollection = useTaskStore((s) => s.deleteCollection);
  const activeTrackerId  = useUIStore((s) => s.activeTrackerId);
  const setActiveTracker = useUIStore((s) => s.setActiveTracker);
  const showAddTracker   = useUIStore((s) => s.showAddTracker);
  const showAddRoutine   = useUIStore((s) => s.showAddRoutine);
  const openEditTracker  = useUIStore((s) => s.openEditTracker);

  const trackers = Object.values(collections).filter((c) => c.kind === 'tracker');
  const routines = Object.values(collections).filter((c) => c.kind === 'routine');
  const activeTracker = activeTrackerId
    ? (collections[activeTrackerId as CollectionId] ?? null)
    : null;

  function handleDeleteTracker(id: string, name: string) {
    if (window.confirm(`Delete tracker "${name}"? All entries will also be deleted.`)) {
      deleteCollection(id as CollectionId);
      if (activeTrackerId === id) setActiveTracker(null);
    }
  }

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Trackers section */}
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Trackers</span>
          <button className={styles.newTrackerBtn} onClick={showAddTracker} title="New tracker">+</button>
        </div>

        {trackers.length === 0 ? (
          <p className={styles.sidebarEmpty}>No trackers yet.</p>
        ) : (
          <ul className={styles.trackerList}>
            {trackers.map((t) => (
              <li key={t.id}>
                <div className={`${styles.trackerItem} ${activeTrackerId === t.id ? styles.trackerItemActive : ''}`}>
                  <button
                    className={styles.trackerSelectBtn}
                    onClick={() => setActiveTracker(t.id)}
                  >
                    {t.color && <span className={styles.trackerDot} style={{ background: t.color }} />}
                    <span className={styles.trackerName}>{t.name}</span>
                  </button>
                  <div className={styles.trackerRowActions}>
                    <button
                      className={styles.trackerActionBtn}
                      onClick={(e) => { e.stopPropagation(); openEditTracker(t.id); }}
                      title="Edit tracker"
                    >✎</button>
                    <button
                      className={`${styles.trackerActionBtn} ${styles.trackerActionBtnDelete}`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteTracker(t.id, t.name); }}
                      title="Delete tracker"
                    >✕</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Routines section */}
        <div className={`${styles.sidebarHeader} ${styles.sidebarHeaderRoutines}`}>
          <span className={styles.sidebarTitle}>Routines</span>
          <button className={styles.newTrackerBtn} onClick={showAddRoutine} title="New routine">+</button>
        </div>

        {routines.length === 0 ? (
          <p className={styles.sidebarEmpty}>No routines yet.</p>
        ) : (
          <div className={styles.routinesList}>
            {routines.map((r) => (
              <div key={r.id} className={styles.routineCard}>
                <RoutineChecklist routine={r} />
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {activeTracker ? (
          <TrackerDetail tracker={activeTracker} />
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateText}>
              {trackers.length === 0
                ? 'Create a tracker to start logging records.'
                : 'Select a tracker from the sidebar.'}
            </p>
            <button className={styles.emptyStateBtn} onClick={showAddTracker}>
              New tracker
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

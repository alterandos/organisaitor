import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useUIStore } from '@/store/uiStore';
import { todayIso } from '@/utils/date';
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
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const parts = [];
      if (h) parts.push(`${h}h`);
      if (m) parts.push(`${m}m`);
      if (s || parts.length === 0) parts.push(`${s}s`);
      return parts.join(' ');
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

interface RoutineDetailProps {
  routine: Collection;
}

function RoutineDetail({ routine }: RoutineDetailProps) {
  const instances = useRoutineStore((s) => s.instances);
  const today     = todayIso();
  const total     = (routine.routineTasks ?? []).length;

  const history = Object.values(instances)
    .filter((inst) => inst.routineId === routine.id && inst.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          {routine.color && (
            <span className={styles.detailDot} style={{ background: routine.color }} />
          )}
          <h2 className={styles.detailTitle}>{routine.name}</h2>
        </div>
      </div>

      <div className={styles.routineDetailSection}>
        <span className={styles.sectionHeading}>Today</span>
        <RoutineChecklist routine={routine} />
      </div>

      {history.length > 0 && (
        <div className={styles.routineDetailSection}>
          <span className={styles.sectionHeading}>History</span>
          <div className={styles.entriesTable}>
            <div className={styles.tableHead}>
              <span className={styles.headDate}>Date</span>
              <span className={styles.headCell}>Steps</span>
              <span className={styles.headCell}>Status</span>
            </div>
            {history.map((inst) => {
              const checked = inst.checked.length;
              const status  = inst.completed
                ? '✓ Completed'
                : checked > 0
                ? 'Partial'
                : 'Skipped';
              return (
                <div key={inst.date} className={styles.entryRow}>
                  <span className={styles.entryDate}>{inst.date}</span>
                  <div className={styles.entryFields}>
                    <span className={styles.entryCell}>
                      <span className={styles.entryCellValue}>
                        {total > 0 ? `${checked}/${total}` : checked > 0 ? `${checked}` : '—'}
                      </span>
                    </span>
                    <span className={styles.entryCell}>
                      <span className={`${styles.entryCellValue} ${inst.completed ? styles.statusDone : ''}`}>
                        {status}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <p className={styles.emptyHint}>No history yet — complete this routine to start tracking.</p>
      )}
    </div>
  );
}

export function RecordsView() {
  const collections        = useTaskStore((s) => s.collections);
  const deleteCollection   = useTaskStore((s) => s.deleteCollection);
  const deleteInstances    = useRoutineStore((s) => s.deleteInstancesForRoutine);
  const activeTrackerId    = useUIStore((s) => s.activeTrackerId);
  const setActiveTracker   = useUIStore((s) => s.setActiveTracker);
  const activeRoutineId    = useUIStore((s) => s.activeRoutineId);
  const setActiveRoutine   = useUIStore((s) => s.setActiveRoutine);
  const showAddTracker     = useUIStore((s) => s.showAddTracker);
  const showAddRoutine     = useUIStore((s) => s.showAddRoutine);
  const openEditTracker    = useUIStore((s) => s.openEditTracker);
  const openEditRoutine    = useUIStore((s) => s.openEditRoutine);

  const trackers = Object.values(collections).filter((c) => c.kind === 'tracker');
  const routines = Object.values(collections).filter((c) => c.kind === 'routine');
  const activeTracker = activeTrackerId
    ? (collections[activeTrackerId as CollectionId] ?? null)
    : null;
  const activeRoutine = activeRoutineId
    ? (collections[activeRoutineId as CollectionId] ?? null)
    : null;

  function handleDeleteTracker(id: string, name: string) {
    if (window.confirm(`Delete tracker "${name}"? All entries will also be deleted.`)) {
      deleteCollection(id as CollectionId);
      if (activeTrackerId === id) setActiveTracker(null);
    }
  }

  function handleDeleteRoutine(id: string, name: string) {
    if (window.confirm(`Delete routine "${name}"? History will also be deleted.`)) {
      deleteInstances(id as CollectionId);
      deleteCollection(id as CollectionId);
      if (activeRoutineId === id) setActiveRoutine(null);
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
          <ul className={styles.trackerList}>
            {routines.map((r) => (
              <li key={r.id}>
                <div className={`${styles.trackerItem} ${activeRoutineId === r.id ? styles.trackerItemActive : ''}`}>
                  <button
                    className={styles.trackerSelectBtn}
                    onClick={() => setActiveRoutine(r.id)}
                  >
                    {r.color && <span className={styles.trackerDot} style={{ background: r.color }} />}
                    <span className={styles.trackerName}>{r.name}</span>
                  </button>
                  <div className={styles.trackerRowActions}>
                    <button
                      className={styles.trackerActionBtn}
                      onClick={(e) => { e.stopPropagation(); openEditRoutine(r.id); }}
                      title="Edit routine"
                    >✎</button>
                    <button
                      className={`${styles.trackerActionBtn} ${styles.trackerActionBtnDelete}`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteRoutine(r.id, r.name); }}
                      title="Delete routine"
                    >✕</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {activeTracker ? (
          <TrackerDetail tracker={activeTracker} />
        ) : activeRoutine ? (
          <RoutineDetail routine={activeRoutine} />
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateText}>
              {trackers.length === 0 && routines.length === 0
                ? 'Create a tracker or routine to get started.'
                : 'Select a tracker or routine from the sidebar.'}
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

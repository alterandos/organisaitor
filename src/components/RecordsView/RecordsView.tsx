import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { todayIso } from '@/utils/date';
import type { Collection, CollectionId, FieldSchema, TrackerEntry, TrackerEntryId } from '@/types';
import { RoutineChecklist } from '@/components/RoutineChecklist/RoutineChecklist';
import styles from './RecordsView.module.css';
import { LABELS } from '@/config/labels';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import { useRowHoverActions } from '@/components/RowHoverActions/useRowHoverActions';
import { RowHoverActionsMenu } from '@/components/RowHoverActions/RowHoverActionsMenu';

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

// Its own component (not inline JSX inside the sidebar's .map()) because useRowHoverActions
// is a hook — has to be called once per row instance, not once per iteration of a shared
// parent's render. Shared by both the tracker and routine sidebar lists below — same row
// shape either way.
function TrackerSidebarRow({
  item, active, onSelect, onEdit, onDelete, editTitle, deleteTitle,
}: {
  item: Collection;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editTitle: string;
  deleteTitle: string;
}) {
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLDivElement>();
  return (
    <div ref={anchorRef} className={`${styles.trackerItem} ${active ? styles.trackerItemActive : ''}`} {...rowHandlers}>
      <button className={styles.trackerSelectBtn} onClick={onSelect}>
        {item.color && <span className={styles.trackerDot} style={{ background: item.color }} />}
        <TruncatedText text={item.name} className={styles.trackerName} />
      </button>
      <RowHoverActionsMenu anchorRef={anchorRef} open={open} {...menuHandlers}>
        <button className={styles.trackerActionBtn} onClick={(e) => { e.stopPropagation(); onEdit(); }} title={editTitle}>✎</button>
        <button className={`${styles.trackerActionBtn} ${styles.trackerActionBtnDelete}`} onClick={(e) => { e.stopPropagation(); onDelete(); }} title={deleteTitle}>✕</button>
      </RowHoverActionsMenu>
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
  const activeCollectionId = useUIStore(selectActiveCollectionId);

  const allTrackers = Object.values(collections).filter((c) => c.kind === 'tracker');
  const allRoutines = Object.values(collections).filter((c) => c.kind === 'routine');
  const trackers = activeCollectionId ? allTrackers.filter((c) => c.collectionId === activeCollectionId) : allTrackers;
  const routines = activeCollectionId ? allRoutines.filter((c) => c.collectionId === activeCollectionId) : allRoutines;
  const activeTracker = activeTrackerId
    ? (collections[activeTrackerId as CollectionId] ?? null)
    : null;
  const activeRoutine = activeRoutineId
    ? (collections[activeRoutineId as CollectionId] ?? null)
    : null;

  async function handleDeleteTracker(id: string, name: string) {
    if (await confirmDelete('tracker', name, 'All its entries will be deleted too.')) {
      deleteCollection(id as CollectionId);
      if (activeTrackerId === id) setActiveTracker(null);
    }
  }

  async function handleDeleteRoutine(id: string, name: string) {
    if (await confirmDelete('routine', name, 'Its history will be deleted too.')) {
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
          <p className={styles.sidebarEmpty}>{activeCollectionId ? `${LABELS.noneInCollection('trackers')}.` : 'No trackers yet.'}</p>
        ) : (
          <ul className={styles.trackerList}>
            {trackers.map((t) => (
              <li key={t.id}>
                <TrackerSidebarRow
                  item={t}
                  active={activeTrackerId === t.id}
                  onSelect={() => setActiveTracker(t.id)}
                  onEdit={() => openEditTracker(t.id)}
                  onDelete={() => handleDeleteTracker(t.id, t.name)}
                  editTitle="Edit tracker"
                  deleteTitle="Delete tracker"
                />
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
          <p className={styles.sidebarEmpty}>{activeCollectionId ? `${LABELS.noneInCollection('routines')}.` : 'No routines yet.'}</p>
        ) : (
          <ul className={styles.trackerList}>
            {routines.map((r) => (
              <li key={r.id}>
                <TrackerSidebarRow
                  item={r}
                  active={activeRoutineId === r.id}
                  onSelect={() => setActiveRoutine(r.id)}
                  onEdit={() => openEditRoutine(r.id)}
                  onDelete={() => handleDeleteRoutine(r.id, r.name)}
                  editTitle="Edit routine"
                  deleteTitle="Delete routine"
                />
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
              {allTrackers.length === 0 && allRoutines.length === 0
                ? 'Create a tracker or routine to get started.'
                : trackers.length === 0 && routines.length === 0
                ? `${LABELS.noneInCollection('trackers or routines')}.`
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

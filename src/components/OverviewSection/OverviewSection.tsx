import { useMemo, useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useOverviewStore } from '@/store/overviewStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useOverviewSnapshot } from '@/overview/useOverviewSnapshot';
import { runOverview, endeavourOverviewQuery, INBOXES_QUERY } from '@/overview/engine';
import { INBOX_ICON } from '@/config/itemIcons';
import { SOURCE_BY_KEY } from '@/overview/sources';
import { openOverviewRow } from '@/overview/open';
import { canTickDone, tickOverviewRow } from '@/overview/done';
import { getOrderedEndeavours } from '@/utils/collections';
import { formatDeadline } from '@/utils/date';
import { todayIsoInZone, resolveTimezone } from '@/utils/timezone';
import { LABELS } from '@/config/labels';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import { RowOptionsMenu } from '@/components/RowHoverActions/RowOptionsMenu';
import { RowAction } from '@/components/RowHoverActions/RowAction';
import type { CollectionId } from '@/types';
import type { Overview, OverviewId, OverviewQuery, OverviewRow } from '@/types/overview';
import styles from './OverviewSection.module.css';
import { DisclosureIcon } from '@/components/Icons';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';

const L = LABELS.overview;

// One line saying what a saved Overview asks for, e.g. "Open only · Upcoming (14 days) · Tasks, Events".
function describeQuery(q: OverviewQuery, endeavourName: string | null): string {
  const parts = [
    L.statusFilter[q.status],
    q.when === 'upcoming' || q.when === 'past'
      ? `${L.whenFilter[q.when]}${q.windowDays != null ? ` (${q.windowDays} days)` : ''}`
      : L.whenFilter[q.when],
    q.sources.length ? q.sources.map((s) => L.sources[s]).join(', ') : L.sourcesAll,
  ];
  if (endeavourName) parts.push(endeavourName);
  if (q.search.trim()) parts.push(`“${q.search.trim()}”`);
  return parts.join(' · ');
}

function SavedRow({ overview, active }: { overview: Overview; active: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const setSelection = useUIStore((s) => s.setOverviewSelection);
  const openEdit = useUIStore((s) => s.openEditOverview);
  const deleteOverview = useOverviewStore((s) => s.deleteOverview);
  return (
    <div ref={rowRef} className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}>
      <RowOptionsMenu rowRef={rowRef} title={overview.name} icon={<span className={styles.navIcon}>{overview.icon ?? '📊'}</span>}>
        <RowAction className={styles.actionBtn} icon="✎" label={L.edit} onClick={() => openEdit(overview.id)} />
        <RowAction
          className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
          icon="✕"
          label={LABELS.rowActions.delete}
          destructive
          onClick={async () => {
            if (await confirmDelete(L.deleteNoun, overview.name)) deleteOverview(overview.id);
          }}
        />
      </RowOptionsMenu>
      <button className={styles.navBtn} onClick={() => setSelection({ kind: 'saved', id: overview.id })}>
        <TruncatedText text={overview.name} className={styles.navName} />
      </button>
    </div>
  );
}

function RowView({ row, showEndeavour, today }: { row: OverviewRow; showEndeavour: boolean; today: string }) {
  const collections = useTaskStore((s) => s.collections);
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const source = SOURCE_BY_KEY[row.source];
  const endeavour = row.endeavourId ? collections[row.endeavourId as CollectionId] : undefined;
  const overdue = row.status === 'open' && !!row.when && row.when < today;
  return (
    <div className={`${styles.row} ${row.status !== 'open' ? styles.rowDone : ''}`} data-status={row.status}>
      <span className={styles.cellTick}>
        {canTickDone(row) && (
          <input type="checkbox" className={styles.tick} checked={row.status === 'done'}
            aria-label={row.status === 'done' ? L.markNotDone(row.title) : L.markDone(row.title)}
            title={row.status === 'done' ? L.markNotDone(row.title) : L.markDone(row.title)}
            onChange={() => tickOverviewRow(row)} />
        )}
      </span>
      <button className={styles.rowOpen} onClick={() => openOverviewRow(row)}>
        {/* A task's kind icon is a ticked box: beside the tick box it would read as a second one. */}
        <span className={styles.cellIcon} title={source.label}>{row.source === 'task' && canTickDone(row) ? null : source.icon}</span>
        <span className={styles.cellWhat}>
          <span className={styles.title}>{row.title}</span>
          {row.context && <span className={styles.context}>{row.context}</span>}
        </span>
        <span className={`${styles.cellWhen} ${overdue ? styles.overdue : ''}`}>
          {row.when ? formatDeadline(row.when, row.time, clockFormat) : L.noDate}
        </span>
        <span className={styles.cellStatus}>
          <span className={`${styles.status} ${styles[`status_${row.status}`]}`}>{row.status === 'done' && <span aria-hidden="true">✓ </span>}{L.status[row.status]}</span>
        </span>
        {showEndeavour && (
          <span className={styles.cellEndeavour}>
            {endeavour && <span className={styles.dot} style={endeavour.color ? { background: endeavour.color } : undefined} />}
            {endeavour?.name ?? ''}
          </span>
        )}
      </button>
    </div>
  );
}

// The Overview section: everything, from every app, for a question — an Endeavour's automatic
// Overview or a saved one (see src/overview/ and docs/features/overview.md).
export function OverviewSection() {
  const paneResize = usePaneWidth('overview-sidebar', { edge: 'right', min: 160, max: 480 });
  const collections = useTaskStore((s) => s.collections);
  const overviews   = useOverviewStore((s) => s.overviews);
  const selection   = useUIStore((s) => s.overviewSelection);
  const setSelection = useUIStore((s) => s.setOverviewSelection);
  const showAdd     = useUIStore((s) => s.showAddOverview);
  const openEdit    = useUIStore((s) => s.openEditOverview);
  const timezone    = useSettingsStore((s) => s.timezone);
  const snapshot    = useOverviewSnapshot();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const today = todayIsoInZone(resolveTimezone(timezone));
  const endeavours = getOrderedEndeavours(collections);
  const saved = Object.values(overviews).sort((a, b) => a.name.localeCompare(b.name));

  // A selection pointing at something since deleted or archived reads as "nothing selected".
  const selectedEndeavour = selection?.kind === 'endeavour' ? collections[selection.id as CollectionId] : undefined;
  const selectedSaved = selection?.kind === 'saved' ? overviews[selection.id as OverviewId] : undefined;
  const endeavourQueryId = selectedEndeavour && !selectedEndeavour.archivedAt ? selectedEndeavour.id : null;
  const inboxes = selection?.kind === 'builtIn' && selection.id === 'inboxes';
  const query: OverviewQuery | null = useMemo(
    () => (inboxes ? INBOXES_QUERY : selectedSaved ?? (endeavourQueryId ? endeavourOverviewQuery(endeavourQueryId) : null)),
    [inboxes, selectedSaved, endeavourQueryId],
  );

  const result = useMemo(() => (query ? runOverview(query, snapshot, today) : null), [query, snapshot, today]);

  const heading = inboxes ? L.allInboxes : selectedSaved
    ? selectedSaved.name
    : selectedEndeavour ? L.endeavourTitle(selectedEndeavour.name) : '';
  const queryEndeavour = query?.collectionId ? collections[query.collectionId] : undefined;

  const toggleGroup = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className={styles.shell}>
      <aside style={paneResize.style} className={styles.sidebar}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>{L.builtInHeading}</span>
        </div>
        <div className={`${styles.navItem} ${inboxes ? styles.navItemActive : ''}`}>
          <button className={styles.navBtn} onClick={() => setSelection({ kind: 'builtIn', id: 'inboxes' })}>
            <span aria-hidden="true">{INBOX_ICON}</span>
            <TruncatedText text={L.allInboxes} className={styles.navName} />
          </button>
        </div>

        <div className={`${styles.sidebarHeader} ${styles.sidebarHeaderSecond}`}>
          <span className={styles.sidebarTitle}>{L.endeavoursHeading}</span>
        </div>
        {endeavours.map((c) => {
          const active = selection?.kind === 'endeavour' && selection.id === c.id;
          return (
            <div key={c.id} className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}>
              <button className={styles.navBtn} onClick={() => setSelection({ kind: 'endeavour', id: c.id })}>
                <span className={styles.dot} style={c.color ? { background: c.color } : undefined} />
                <TruncatedText text={c.name} className={styles.navName} />
              </button>
            </div>
          );
        })}

        <div className={`${styles.sidebarHeader} ${styles.sidebarHeaderSecond}`}>
          <span className={styles.sidebarTitle}>{L.savedHeading}</span>
        </div>
        {saved.length === 0 && <p className={styles.sidebarEmpty}>{L.noSaved}</p>}
        {saved.map((o) => (
          <SavedRow key={o.id} overview={o} active={selection?.kind === 'saved' && selection.id === o.id} />
        ))}
        <button className={styles.newBtn} onClick={showAdd}>{L.newOverview}</button>
      </aside>

      <main className={styles.main}>
        {!query || !result ? (
          <p className={styles.hint}>{L.pickHint}</p>
        ) : (
          <>
            <header className={styles.header}>
              <div className={styles.headerText}>
                <h2 className={styles.heading}>{heading}</h2>
                <span className={styles.summary}>
                  {describeQuery(query, selectedSaved && queryEndeavour ? queryEndeavour.name : null)} · {L.count(result.total)}
                </span>
              </div>
              {selectedSaved && (
                <button className={styles.editBtn} onClick={() => openEdit(selectedSaved.id)}>{L.edit}</button>
              )}
            </header>

            {result.hiddenLocked > 0 && <p className={styles.locked}>🔒 {L.lockedHidden(result.hiddenLocked)}</p>}
            {result.total === 0 && <p className={styles.hint}>{L.noRows}</p>}

            {result.groups.map((g) => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <section key={g.key} className={styles.group}>
                  {g.label && (
                    <button className={styles.groupHeader} onClick={() => toggleGroup(g.key)} aria-expanded={!isCollapsed}>
                      <DisclosureIcon open={!isCollapsed} />
                      {g.label} <span className={styles.groupCount}>{g.rows.length}</span>
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className={styles.rows}>
                      {g.rows.map((r) => <RowView key={r.key} row={r} showEndeavour={!query.collectionId} today={today} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

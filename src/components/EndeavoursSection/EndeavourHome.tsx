import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useListViews } from '@/store/listViews';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { childrenOf, parentsOf } from '@/utils/endeavourGraph';
import { rowsOfEndeavour, summarizeRows } from '@/utils/endeavourSummary';
import { SOURCE_BY_KEY } from '@/overview/sources';
import { openOverviewRow } from '@/overview/open';
import { canTickDone, tickOverviewRow } from '@/overview/done';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { EditIcon } from '@/components/Icons';
import type { Collection, CollectionId, NoteTagId } from '@/types';
import type { OverviewRow } from '@/types/overview';
import { useEndeavourRows } from './useEndeavourRows';
import styles from './EndeavoursSection.module.css';

const L = LABELS.endeavourHome;
const isEndeavour = (c: Collection | undefined): c is Collection => !!c && (c.kind === 'project' || c.kind === 'list') && !c.archivedAt;
const day = (iso: string) => formatDate(`${iso}T00:00:00`);

// One Endeavour's home (screens B and C of docs/features/endeavours.md): where it stands, built
// from what it and everything part of it hold. A panel shows only when there's something in it, and
// anything made from the add row is filed here (in this section the open home is the active
// Endeavour, selectActiveCollectionId). A parent's home is its parts' work together.
export function EndeavourHome({ id }: { id: CollectionId }) {
  const collections = useTaskStore((s) => s.collections);
  const noteTags    = useNoteStore((s) => s.noteTags);
  const schedules   = useScheduleStore((s) => s.schedules);
  const lists       = useListViews();
  const ui          = useUIStore.getState;
  const openHome    = useUIStore((s) => s.openEndeavourHome);
  const { rows, today } = useEndeavourRows();
  const c = collections[id];

  const summary = useMemo(() => summarizeRows(rowsOfEndeavour(rows, id, collections), today), [rows, id, collections, today]);

  if (!c) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.linkBtn} onClick={() => openHome(null)}>‹ {L.allEndeavours}</button>
        <p className={styles.empty}>{L.missing}</p>
      </div>
    );
  }

  const parents = parentsOf(c, collections).filter((p) => isEndeavour(collections[p]));
  const trail: Collection[] = [];
  for (let p = parents[0], guard = 0; p && guard < 20; guard++) {
    const pc = collections[p];
    if (!pc || trail.some((t) => t.id === p) || p === id) break;
    trail.unshift(pc);
    p = parentsOf(pc, collections).filter((q) => isEndeavour(collections[q]))[0];
  }
  const otherParents = parents.slice(1).map((p) => collections[p]);
  const parts = childrenOf(id, collections).filter((k) => isEndeavour(collections[k])).sort((a, b) => collections[a].name.localeCompare(collections[b].name));
  const notebooks = Object.values(noteTags).filter((t) => t.kind === 'area' && t.collectionId === id).sort((a, b) => a.name.localeCompare(b.name));
  const ownLists = Object.values(lists).filter((l) => l.collectionId === id).sort((a, b) => a.name.localeCompare(b.name));
  const timetables = Object.values(schedules).filter((s) => s.collectionId === id).sort((a, b) => a.name.localeCompare(b.name));
  const records = Object.values(collections)
    .filter((x) => (x.kind === 'tracker' || x.kind === 'routine') && !x.archivedAt && parentsOf(x, collections).includes(id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const openInCalendar = () => { ui().setActiveView('calendar'); ui().setActiveCollection(id); };
  const openNotebook = (tagId: string) => { ui().setActiveView('notes'); ui().setSelectedNoteTag(tagId as NoteTagId); };
  const openList = (listId: string) => { ui().requestListSelection(listId); ui().setActiveView('lists'); };
  const openRecord = (x: Collection) => {
    if (x.kind === 'tracker') ui().setActiveTracker(x.id); else ui().setActiveRoutine(x.id);
    ui().setActiveView('records');
  };

  const adds: { key: keyof typeof L.add; run: () => void }[] = [
    { key: 'task',      run: () => ui().showAddTask() },
    { key: 'event',     run: () => ui().showAddCalendarItem() },
    { key: 'notebook',  run: () => ui().showAddNoteTag(null, 'area') },
    { key: 'list',      run: () => ui().showAddList() },
    { key: 'timetable', run: () => ui().showAddSchedule() },
    { key: 'tracker',   run: () => ui().showAddTracker() },
    { key: 'routine',   run: () => ui().showAddRoutine() },
    { key: 'endeavour', run: () => ui().showAddCollection() },
  ];

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label={L.allEndeavours}>
        <button type="button" className={styles.linkBtn} onClick={() => openHome(null)}>{L.allEndeavours}</button>
        {trail.map((t) => (
          <span key={t.id}> › <button type="button" className={styles.linkBtn} onClick={() => openHome(t.id)}>{t.name}</button></span>
        ))}
        {otherParents.length > 0 && (
          <span className={styles.muted}> · {L.alsoIn('')}{otherParents.map((p, i) => (
            <span key={p.id}>{i > 0 ? ', ' : ''}<button type="button" className={styles.linkBtn} onClick={() => openHome(p.id)}>{p.name}</button></span>
          ))}</span>
        )}
      </nav>

      <header className={styles.homeHead}>
        <div className={styles.homeTitleRow}>
          <span className={styles.dotLarge} style={c.color ? { background: c.color } : undefined} aria-hidden />
          <h2 className={styles.homeTitle}>{c.name}</h2>
          {summary.behind.length > 0 ? <span className={styles.pillBad}>{L.behind(summary.behind.length)}</span> : <span className={styles.pillOk}>{L.onTrack}</span>}
        </div>
        <p className={styles.homeMeta}>
          {c.kind === 'project' ? (c.deadline ? L.due(day(c.deadline)) : LABELS.collectionKind.project) : L.ongoing}
          {c.description && <> · {c.description}</>}
        </p>
        <div className={styles.homeActions}>
          <button type="button" className={styles.btn} onClick={() => ui().openEditCollection(c)}><EditIcon /> {L.edit}</button>
          <button type="button" className={styles.btn} onClick={openInCalendar}>{L.openCalendar}</button>
          <button type="button" className={styles.btn} onClick={() => ui().openEndeavourOverview(id)}>{L.openOverview}</button>
        </div>
      </header>

      <div className={styles.panels}>
        {summary.behind.length > 0 && (
          <Panel title={L.panels.behind} tone="bad">
            {summary.behind.map((r) => <Row key={r.key} row={r} homeId={id} collections={collections} />)}
          </Panel>
        )}
        <Panel title={L.panels.thisWeek}>
          {summary.thisWeek.length === 0
            ? <p className={styles.muted}>{L.weekEmpty}</p>
            : summary.thisWeek.map((r) => <Row key={r.key} row={r} homeId={id} collections={collections} />)}
        </Panel>
        {summary.comingUp.length > 0 && (
          <Panel title={L.panels.comingUp}>
            {summary.comingUp.map((r) => <Row key={r.key} row={r} homeId={id} collections={collections} />)}
          </Panel>
        )}
      </div>

      {parts.length > 0 && (
        <section className={styles.partsSection} aria-label={L.panels.parts}>
          <h3 className={styles.panelTitle}>{L.panels.parts}</h3>
          <div className={styles.cards}>
            {parts.map((k) => <PartCard key={k} part={collections[k]} rows={rows} today={today} collections={collections} />)}
          </div>
        </section>
      )}

      {(notebooks.length > 0 || ownLists.length > 0 || timetables.length > 0 || records.length > 0) && (
        <div className={styles.panels}>
          {notebooks.length > 0 && (
            <Panel title={L.panels.notebooks}>
              {notebooks.map((t) => (
                <button key={t.id} type="button" className={styles.thing} onClick={() => openNotebook(t.id)}>
                  <ItemIcon icon={t.icon} fallback="📁" /> {t.name}
                </button>
              ))}
            </Panel>
          )}
          {ownLists.length > 0 && (
            <Panel title={L.panels.lists}>
              {ownLists.map((l) => (
                <button key={l.id} type="button" className={styles.thing} onClick={() => openList(l.id)}>
                  <ItemIcon icon={l.icon} fallback="📋" /> {l.name}
                </button>
              ))}
            </Panel>
          )}
          {timetables.length > 0 && (
            <Panel title={L.panels.timetables}>
              {timetables.map((s) => (
                <button key={s.id} type="button" className={styles.thing} onClick={() => ui().openEditSchedule(s)}>
                  🗓 {s.name} <span className={styles.muted}>· {s.blocks.length}</span>
                </button>
              ))}
            </Panel>
          )}
          {records.length > 0 && (
            <Panel title={L.panels.records}>
              {records.map((x) => (
                <button key={x.id} type="button" className={styles.thing} onClick={() => openRecord(x)}>
                  {x.kind === 'tracker' ? LABELS.tracker : LABELS.routine}: {x.name}
                </button>
              ))}
            </Panel>
          )}
        </div>
      )}

      <div className={styles.addRow} role="group" aria-label={L.addTo(c.name)}>
        <span className={styles.muted}>{L.addTo(c.name)}:</span>
        {adds.map((a) => <button key={a.key} type="button" className={styles.ghost} onClick={a.run}>+ {L.add[a.key]}</button>)}
      </div>
    </div>
  );
}

function Panel({ title, tone, children }: { title: string; tone?: 'bad'; children: React.ReactNode }) {
  return (
    <section className={`${styles.panel} ${tone === 'bad' ? styles.panelBad : ''}`} aria-label={title}>
      <h3 className={styles.panelTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ row, homeId, collections }: { row: OverviewRow; homeId: string; collections: Record<string, Collection> }) {
  const owner = row.endeavourId && row.endeavourId !== homeId ? collections[row.endeavourId] : null;
  return (
    <div className={styles.row}>
      {canTickDone(row)
        ? <input type="checkbox" className={styles.tick} checked={row.status === 'done'} onChange={() => tickOverviewRow(row)} aria-label={row.title} />
        : <span className={styles.rowIcon} aria-hidden>{SOURCE_BY_KEY[row.source].icon}</span>}
      <button type="button" className={styles.rowTitle} onClick={() => openOverviewRow(row)}>{row.title}</button>
      {owner && <span className={styles.owner}><span className={styles.dot} style={owner.color ? { background: owner.color } : undefined} aria-hidden />{owner.name}</span>}
      {row.when && <span className={styles.rowWhen}>{day(row.when)}{row.time ? ` ${row.time}` : ''}</span>}
    </div>
  );
}

function PartCard({ part, rows, today, collections }: { part: Collection; rows: OverviewRow[]; today: string; collections: Record<string, Collection> }) {
  const openHome = useUIStore((s) => s.openEndeavourHome);
  const s = useMemo(() => summarizeRows(rowsOfEndeavour(rows, part.id, collections), today), [rows, part.id, collections, today]);
  return (
    <button type="button" className={styles.card} style={part.color ? { borderTopColor: part.color } : undefined} onClick={() => openHome(part.id)}>
      <span className={styles.cardTitle}>{part.name}</span>
      <span className={styles.cardRow}>
        <span className={styles.muted}>{L.colBehind}</span>
        {s.behind.length > 0 ? <span className={styles.pillBad}>{L.behind(s.behind.length)}</span> : <span className={styles.pillOk}>{L.onTrack}</span>}
      </span>
      <span className={styles.cardRow}>
        <span className={styles.muted}>{L.colNext}</span>
        <span className={styles.cardNext}>{s.next ? `${s.next.title} · ${day(s.next.when!)}` : L.nothingNext}</span>
      </span>
    </button>
  );
}

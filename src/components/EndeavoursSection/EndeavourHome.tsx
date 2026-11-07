import { endeavourColor, endeavourIcon } from '@/utils/endeavourLook';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { childrenOf, endeavourSubtree, parentsOf } from '@/utils/endeavourGraph';
import { isRhythm } from '@/utils/rhythms';
import { RhythmBoard } from '@/components/RhythmBoard/RhythmBoard';
import { ItemBoard } from '@/components/RhythmBoard/ItemBoard';
import { GoalsPanel } from './GoalsPanel';
import { rowsOfEndeavour, summarizeRows } from '@/utils/endeavourSummary';
import { SOURCE_BY_KEY } from '@/overview/sources';
import { openOverviewRow } from '@/overview/open';
import { canTickDone, tickOverviewRow } from '@/overview/done';
import { DisclosureIcon, EditIcon } from '@/components/Icons';
import { foldSeries } from '@/overview/series';
import type { Collection, CollectionId } from '@/types';
import type { OverviewRow } from '@/types/overview';
import { useEndeavourRows } from './useEndeavourRows';
import { useEndeavourMenu } from './endeavourMenu';
import { EndeavourPieces } from '@/components/EndeavourPieces/EndeavourPieces';
import { captureTemplate } from '@/services/templates';
import { effectivePeriod } from '@/utils/endeavourPeriod';
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
  const ui          = useUIStore.getState;
  const openHome    = useUIStore((s) => s.openEndeavourHome);
  const { rows, today } = useEndeavourRows();
  const c = collections[id];

  // Its rhythms (routines part of it, or of its parts): each one's board (screen B).
  const rhythms = useMemo(() => {
    const scope = endeavourSubtree(id, collections);
    return Object.values(collections).filter((x) => isRhythm(x) && !x.archivedAt && x.id !== id && scope.has(x.id));
  }, [id, collections]);
  // Its repeating classes and Work, week by week (phase 7 (e)): its own board, then each part's
  // (a semester's subjects). A board with nothing repeating draws nothing.
  const boardOwners = useMemo(() => {
    const scope = endeavourSubtree(id, collections);
    return [id, ...[...scope].filter((x) => x !== id)]
      .map((x) => collections[x as CollectionId])
      .filter((x): x is Collection => !!x && (x.kind === 'project' || x.kind === 'list') && !x.archivedAt);
  }, [id, collections]);
  const summary = useMemo(() => summarizeRows(rowsOfEndeavour(rows, id, collections), today), [rows, id, collections, today]);
  const headRef = useEndeavourMenu<HTMLElement>(id);

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
  const ends = effectivePeriod(id, collections)?.period.end ?? null;
  const meta = [c.kind === 'project' ? (ends ? L.ends(day(ends)) : '') : L.ongoing, c.description ?? ''].filter(Boolean).join(' · ');
  const openInCalendar = () => { ui().setActiveView('calendar'); ui().setActiveCollection(id); };

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

      <header ref={headRef} className={styles.homeHead}>
        <div className={styles.homeTitleRow}>
          {endeavourIcon(c.id, collections)
            ? <ItemIcon icon={endeavourIcon(c.id, collections)} className={styles.homeIcon} />
            : <span className={styles.dotLarge} style={endeavourColor(c.id, collections) ? { background: endeavourColor(c.id, collections)! } : undefined} aria-hidden />}
          <h2 className={styles.homeTitle}>{c.name}</h2>
          {summary.behind.length > 0 ? <span className={styles.pillBad}>{L.behind(summary.behind.length)}</span> : <span className={styles.pillOk}>{L.onTrack}</span>}
        </div>
        {meta && <p className={styles.homeMeta}>{meta}</p>}
        <div className={styles.homeActions}>
          <button type="button" className={styles.btn} onClick={() => ui().openEditCollection(c)}><EditIcon /> {L.edit}</button>
          <button type="button" className={styles.btn} onClick={openInCalendar}>{L.openCalendar}</button>
          <button type="button" className={styles.btn} onClick={() => ui().openEndeavourOverview(id)}>{L.openOverview}</button>
          <button type="button" className={styles.btn} onClick={() => ui().showEndeavourContents(id)}>{LABELS.endeavourContents.manage}</button>
          <button type="button" className={styles.btn} onClick={() => { const t = captureTemplate(id); if (t) ui().openTemplateEditor(t); }}>{LABELS.templates.saveFrom}</button>
          <button type="button" className={styles.btn} onClick={() => ui().showRestructure(id)}>{LABELS.restructure.menu}…</button>
        </div>
      </header>

      <GoalsPanel endeavourId={id} today={today} />

      <div className={`${styles.panels} ${styles.summaryPanels}`}>
        {summary.behind.length > 0 && (
          <Panel title={L.panels.behind} tone="bad">
            <FoldedRowList rows={summary.behind} homeId={id} collections={collections} />
          </Panel>
        )}
        <Panel title={L.panels.thisWeek}>
          {summary.thisWeek.length === 0
            ? <p className={styles.muted}>{L.weekEmpty}</p>
            : <FoldedRowList rows={summary.thisWeek} homeId={id} collections={collections} />}
        </Panel>
        {summary.comingUp.length > 0 && (
          <Panel title={L.panels.comingUp}>
            <FoldedRowList rows={summary.comingUp} homeId={id} collections={collections} />
          </Panel>
        )}
      </div>

      {boardOwners.map((x) => <ItemBoard key={x.id} endeavour={x} today={today} />)}
      {rhythms.map((r) => <RhythmBoard key={r.id} rhythm={r} today={today} />)}

      {parts.length > 0 && (
        <section className={styles.partsSection} aria-label={L.panels.parts}>
          <h3 className={styles.panelTitle}>{L.panels.parts}</h3>
          <div className={styles.cards}>
            {parts.map((k) => <PartCard key={k} part={collections[k]} rows={rows} today={today} collections={collections} />)}
          </div>
        </section>
      )}

      <EndeavourPieces id={id} />
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

// A panel's rows, a rule's tasks for each date folded under the next one (overview/series.ts).
function FoldedRowList({ rows, homeId, collections }: { rows: OverviewRow[]; homeId: string; collections: Record<string, Collection> }) {
  const { shown, folded } = foldSeries(rows);
  return <>{shown.map((r) => <FoldedRow key={r.key} row={r} more={folded.get(r.key) ?? []} homeId={homeId} collections={collections} />)}</>;
}

function FoldedRow({ row, more, homeId, collections }: { row: OverviewRow; more: OverviewRow[]; homeId: string; collections: Record<string, Collection> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row row={row} homeId={homeId} collections={collections} />
      {more.length > 0 && (
        <button type="button" className={styles.foldToggle} aria-expanded={open} title={row.series?.label} onClick={() => setOpen((o) => !o)}>
          <DisclosureIcon open={open} /> {open ? LABELS.eventTaskRules.foldHide : LABELS.eventTaskRules.foldMore(more.length)}
        </button>
      )}
      {open && more.map((r) => <Row key={r.key} row={r} homeId={homeId} collections={collections} />)}
    </>
  );
}

function Row({ row, homeId, collections }: { row: OverviewRow; homeId: string; collections: Record<string, Collection> }) {
  const owner = row.endeavourId && row.endeavourId !== homeId ? collections[row.endeavourId] : null;
  return (
    <div className={`${styles.row} ${row.quiet ? styles.rowQuiet : ''}`}>
      {canTickDone(row)
        ? <input type="checkbox" className={styles.tick} checked={row.status === 'done'} onChange={() => tickOverviewRow(row)} aria-label={row.title} />
        : <span className={styles.rowIcon} aria-hidden>{SOURCE_BY_KEY[row.source].icon}</span>}
      <button type="button" className={styles.rowTitle} onClick={() => openOverviewRow(row)} title={row.series?.label}>{row.title}</button>
      {owner && <span className={styles.owner}><span className={styles.dot} style={endeavourColor(owner.id, collections) ? { background: endeavourColor(owner.id, collections)! } : undefined} aria-hidden />{owner.name}</span>}
      {row.when && <span className={styles.rowWhen}>{day(row.when)}{row.time ? ` ${row.time}` : ''}</span>}
    </div>
  );
}

function PartCard({ part, rows, today, collections }: { part: Collection; rows: OverviewRow[]; today: string; collections: Record<string, Collection> }) {
  const openHome = useUIStore((s) => s.openEndeavourHome);
  const ref = useEndeavourMenu<HTMLButtonElement>(part.id);
  const s = useMemo(() => summarizeRows(rowsOfEndeavour(rows, part.id, collections), today), [rows, part.id, collections, today]);
  return (
    <button ref={ref} type="button" className={styles.card} style={endeavourColor(part.id, collections) ? { borderTopColor: endeavourColor(part.id, collections)! } : undefined} onClick={() => openHome(part.id)}>
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

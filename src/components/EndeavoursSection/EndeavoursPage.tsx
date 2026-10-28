import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useGoalStore } from '@/store/goalStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { goalProgress, goalsOf } from '@/utils/goals';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { childrenOf, parentsOf } from '@/utils/endeavourGraph';
import { rowsOfEndeavour, summarizeRows, type EndeavourSummary } from '@/utils/endeavourSummary';
import { DisclosureIcon, EndeavourIcon } from '@/components/Icons';
import type { Collection, CollectionId } from '@/types';
import { useEndeavourRows } from './useEndeavourRows';
import styles from './EndeavoursSection.module.css';

const L = LABELS.endeavourHome;
type Grouping = 'tree' | 'purpose';

const isEndeavour = (c: Collection | undefined): c is Collection => !!c && (c.kind === 'project' || c.kind === 'list') && !c.archivedAt;

// Screen A of docs/features/endeavours.md: every Endeavour as a tree (or grouped by the Purposes
// they serve), each with how far behind it is and what's next. An Endeavour that is part of several
// is shown under each, marked with where else it is. Opening one goes to its home.
export function EndeavoursPage() {
  const collections = useTaskStore((s) => s.collections);
  const purposes    = useTaskStore((s) => s.purposes);
  const openHome    = useUIStore((s) => s.openEndeavourHome);
  const showAdd     = useUIStore((s) => s.showAddCollection);
  const { rows, today } = useEndeavourRows();
  const [grouping, setGrouping] = useState<Grouping>('tree');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const endeavours = useMemo(() => Object.values(collections).filter(isEndeavour).sort((a, b) => a.name.localeCompare(b.name)), [collections]);
  const liveParents = (c: Collection) => parentsOf(c, collections).filter((p) => isEndeavour(collections[p]));
  const kids = (id: string) => childrenOf(id, collections).filter((k) => isEndeavour(collections[k])).sort((a, b) => collections[a].name.localeCompare(collections[b].name));
  const roots = endeavours.filter((c) => liveParents(c).length === 0);

  const summaries = useMemo(() => {
    const out = new Map<string, EndeavourSummary>();
    for (const c of endeavours) out.set(c.id, summarizeRows(rowsOfEndeavour(rows, c.id, collections), today));
    return out;
  }, [endeavours, rows, collections, today]);

  // Each Endeavour's active goals: how far along they are together (the mean of those with a
  // measure to go on), and each one's line for the tooltip.
  const goals     = useGoalStore((s) => s.goals);
  const tasks     = useTaskStore((s) => s.tasks);
  const entries   = useTrackerStore((s) => s.entries);
  const schedules = useScheduleStore((s) => s.schedules);
  const goalLines = useMemo(() => {
    const out = new Map<string, { pct: number | null; lines: string[] }>();
    for (const c of endeavours) {
      const active = goalsOf(goals, c.id).filter((g) => g.status === 'active');
      if (active.length === 0) continue;
      const progress = active.map((g) => ({ g, p: goalProgress(g, { tasks, collections, entries, schedules }, today) }));
      const known = progress.map((x) => x.p.fraction).filter((f): f is number => f !== null);
      out.set(c.id, {
        pct: known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) : null,
        lines: progress.map(({ g, p }) => `${g.title}: ${p.text}`),
      });
    }
    return out;
  }, [endeavours, goals, tasks, collections, entries, schedules, today]);

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  function renderNode(id: CollectionId, depth: number, path: readonly string[], parentId: string | null): React.ReactNode {
    const c = collections[id];
    if (!c || path.includes(id)) return null;
    const children = kids(id);
    const key = [...path, id].join('/');
    const open = !collapsed.has(key);
    const others = liveParents(c).filter((p) => p !== parentId).map((p) => collections[p].name);
    const s = summaries.get(id);
    return (
      <li key={key}>
        <div className={styles.treeRow} style={{ paddingLeft: `calc(${depth} * var(--space-6))` }}>
          <span className={styles.treeToggle}>
            {children.length > 0 && (
              <button type="button" className={styles.iconBtn} onClick={() => toggle(key)} aria-expanded={open} aria-label={open ? L.collapse(c.name) : L.expand(c.name)}>
                <DisclosureIcon open={open} />
              </button>
            )}
          </span>
          <button type="button" className={styles.treeName} onClick={() => openHome(id)}>
            <span className={styles.dot} style={c.color ? { background: c.color } : undefined} aria-hidden />
            <span className={styles.nameText}>{c.name}</span>
            {others.length > 0 && <span className={styles.also}>{L.alsoIn(others.join(', '))}</span>}
            {goalLines.get(id) && (
              <span className={styles.goalBadge} title={goalLines.get(id)!.lines.join('\n')}>
                🎯 {goalLines.get(id)!.pct !== null ? `${goalLines.get(id)!.pct}%` : LABELS.goals.summary(goalLines.get(id)!.lines.length)}
              </span>
            )}
          </button>
          <span className={styles.treeBehind}>
            {s && s.behind.length > 0 ? <span className={styles.pillBad}>{L.behind(s.behind.length)}</span> : <span className={styles.pillOk}>{L.onTrack}</span>}
          </span>
          <span className={styles.treeNext}>
            {s?.next ? <>{s.next.title} <span className={styles.muted}>· {formatDate(`${s.next.when}T00:00:00`)}</span></> : <span className={styles.muted}>{L.nothingNext}</span>}
          </span>
        </div>
        {open && children.length > 0 && <ul className={styles.tree}>{children.map((k) => renderNode(k, depth + 1, [...path, id], id))}</ul>}
      </li>
    );
  }

  const groups: { key: string; label: string | null; roots: Collection[] }[] = grouping === 'tree'
    ? [{ key: 'all', label: null, roots }]
    : [
      ...Object.values(purposes).filter((p) => !p.archivedAt).sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ key: p.id, label: p.name, roots: roots.filter((c) => c.purposeIds.includes(p.id)) })),
      { key: 'none', label: L.noPurpose, roots: roots.filter((c) => c.purposeIds.length === 0 || c.purposeIds.every((p) => !purposes[p] || purposes[p].archivedAt)) },
    ].filter((g) => g.roots.length > 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <div className={styles.segmented} role="group" aria-label={L.grouping}>
          {(['tree', 'purpose'] as const).map((g) => (
            <button key={g} type="button" className={grouping === g ? styles.segOn : styles.seg} aria-pressed={grouping === g} onClick={() => setGrouping(g)}>
              {g === 'tree' ? L.groupTree : L.groupPurpose}
            </button>
          ))}
        </div>
        <span className={styles.spacer} />
        <button type="button" className={styles.primaryBtn} onClick={showAdd}><EndeavourIcon /> {L.create}</button>
      </div>

      {endeavours.length === 0 ? (
        <p className={styles.empty}>{L.empty}</p>
      ) : (
        <div className={styles.treePanel}>
          <div className={styles.treeHead} aria-hidden>
            <span />
            <span>{L.colName}</span>
            <span>{L.colBehind}</span>
            <span>{L.colNext}</span>
          </div>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label ?? undefined}>
              {g.label && <h2 className={styles.groupHead}>{g.label}</h2>}
              <ul className={styles.tree}>{g.roots.map((c) => renderNode(c.id, 0, [], null))}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

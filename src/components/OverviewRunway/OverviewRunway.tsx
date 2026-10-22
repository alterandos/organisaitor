import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { SOURCE_BY_KEY } from '@/overview/sources';
import { moveRowDate, setRowStart } from '@/overview/edit';
import { ZOOMS, daysBetween, runwayBands, runwayRange, shift, type Zoom } from '@/overview/timeline';
import { formatDeadline } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { DisclosureIcon } from '@/components/Icons';
import type { OverviewRow } from '@/types/overview';
import styles from './OverviewRunway.module.css';

const L = LABELS.overview.runway;
const LABEL_W = 240;

// The Runway (agreed with the user 2026-10-22): an Overview drawn as the time left to each thing.
// A bar runs from today (or a task's start) to its due date, so a longer bar is more runway; an
// overdue one runs back from today, red, to the date it was due. Events are their own span,
// reminders and other moments a dot. Bands: Important, then By date, then the No date tray.
// Dragging a bar's right end moves its due date (an event or a moment moves whole); dragging its
// left end sets when work starts, and on a standalone Deadline plans the work (it becomes a task):
// all through overview/edit.ts, each with Undo. It only reads the rows it's given, so it could be
// mounted anywhere (the Calendar, later). On a phone the Board is shown instead (OverviewSection).
interface Props { rows: OverviewRow[]; today: string; onOpen: (row: OverviewRow) => void }

type Drag = { key: string; part: 'end' | 'start' | 'move'; delta: number };

export function OverviewRunway({ rows, today, onOpen }: Props) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [drag, setDrag] = useState<Drag | null>(null);
  // Events whose linked tasks are folded away (open by default).
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const bands = useMemo(() => runwayBands(rows), [rows]);
  const { start, days } = useMemo(() => runwayRange([...bands.important, ...bands.due, ...Object.values(bands.children).flat()], today, zoom), [bands, today, zoom]);
  const px = ZOOMS[zoom].px;
  const x = (date: string) => daysBetween(start, date) * px;
  const width = days * px;
  const end = shift(start, days - 1);

  // Today a little in from the left whenever the zoom changes (and at first).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, daysBetween(start, today) * px - (el.clientWidth - LABEL_W) * 0.15);
  }, [zoom, start, today, px]);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - (el.clientWidth - LABEL_W) * 0.15), behavior: 'smooth' });
  };

  // Dragging a handle: whole days, shown live, committed on release.
  const startDrag = (row: OverviewRow, part: Drag['part']) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let delta = 0;
    setDrag({ key: row.key, part, delta: 0 });
    const move = (ev: PointerEvent) => {
      const d = Math.round((ev.clientX - x0) / px);
      if (d !== delta) { delta = d; setDrag({ key: row.key, part, delta: d }); }
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!delta || !row.when) return;
      if (part === 'start') setRowStart(row, shift(row.plan?.start ?? today, delta));
      else moveRowDate(row, shift(row.when, delta));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  // How far off an event or a moment is: "in 3 days", "tomorrow", "today", "on now".
  const away = (first: string, last: string) => {
    if (first > today) return L.inDays(daysBetween(today, first));
    return last >= today && first < today ? L.onNow : last < today ? L.ago(daysBetween(last, today)) : L.inDays(0);
  };

  const ticks = useMemo(() => axisTicks(start, days, zoom), [start, days, zoom]);

  const bar = (row: OverviewRow) => {
    const p = row.plan!;
    const d = drag?.key === row.key ? drag : null;
    const due = shift(row.when!, d && d.part !== 'start' ? d.delta : 0);
    const open = row.status === 'open';
    const editable = p.movable && open;
    const clipped = due > end;
    const dueX = x(clipped ? end : due);
    const label = (labelAt: number) => (
      <span className={styles.barLabel} style={{ left: labelAt + px + 6 }}>
        {formatDeadline(due, row.time, clockFormat)}
        {open && p.shape === 'due' && <> · {due < today ? L.daysLate(daysBetween(due, today)) : L.daysLeft(daysBetween(today, due))}</>}
        {open && p.shape !== 'due' && <> · {away(due, p.shape === 'block' && p.endDate ? p.endDate : due)}</>}
      </span>
    );
    if (p.shape === 'point') {
      return (
        <>
          <span className={`${styles.point} ${editable ? styles.grab : ''}`} style={{ left: dueX + px / 2 }}
            title={editable ? L.dragDue : undefined} onPointerDown={editable ? startDrag(row, 'move') : undefined} />
          {label(dueX)}
        </>
      );
    }
    if (p.shape === 'block') {
      const last = p.endDate ? shift(p.endDate, d ? d.delta : 0) : due;
      const lastX = x(last > end ? end : last);
      return (
        <>
          <span className={`${styles.block} ${editable ? styles.grab : ''}`} style={{ left: dueX, width: Math.max(px, lastX - dueX + px) }}
            title={editable ? L.dragDue : undefined} onPointerDown={editable ? startDrag(row, 'move') : undefined} />
          {label(lastX)}
        </>
      );
    }
    // Due: overdue runs back from today; otherwise from the start (or today) to the due date.
    if (open && due < today) {
      return (
        <>
          <span className={`${styles.bar} ${styles.late}`} style={{ left: x(due), width: x(today) - x(due) + px }}>
            {editable && <span className={`${styles.handle} ${styles.handleStart}`} title={L.dragDue} onPointerDown={startDrag(row, 'end')} />}
          </span>
          <span className={styles.barLabel} style={{ left: x(today) + px + 6 }}>{L.daysLate(daysBetween(due, today))}</span>
        </>
      );
    }
    const startDate = p.start ? shift(p.start, d?.part === 'start' ? d.delta : 0) : d?.part === 'start' ? shift(today, d.delta) : null;
    const from = startDate ?? today;
    const left = x(from < start ? start : from);
    return (
      <>
        {startDate && startDate > today && <span className={styles.waiting} style={{ left: x(today) + px / 2, width: x(startDate) - x(today) }} />}
        <span className={`${styles.bar} ${startDate ? styles.planned : ''} ${open ? '' : styles.finished} ${clipped ? styles.clipped : ''}`}
          style={{ left, width: Math.max(px, dueX - left + px) }}>
          {editable && (row.source === 'task' || row.source === 'deadline') && (
            <span className={`${styles.handle} ${styles.handleStart}`} title={row.source === 'deadline' ? L.planWork : L.dragStart} onPointerDown={startDrag(row, 'start')} />
          )}
          {editable && <span className={`${styles.handle} ${styles.handleEnd}`} title={L.dragDue} onPointerDown={startDrag(row, 'end')} />}
        </span>
        {label(dueX)}
      </>
    );
  };

  const toggleFold = (key: string) => setFolded((f) => {
    const next = new Set(f);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  // A row, and under it the tasks linked to it (bands.children), which show where it falls.
  const line = (row: OverviewRow, parent?: OverviewRow): React.ReactNode => {
    const source = SOURCE_BY_KEY[row.source];
    const kids = parent ? [] : bands.children[row.key] ?? [];
    const isFolded = folded.has(row.key);
    const dated = !!row.when && row.plan!.shape !== 'tray';
    return (
      <div key={row.key} role="group">
        <div className={`${styles.line} ${row.status !== 'open' ? styles.lineDone : ''} ${row.plan?.important ? styles.important : ''} ${parent ? styles.child : ''}`}>
          <div className={styles.what}>
            {kids.length > 0 && (
              <button type="button" className={styles.fold} onClick={() => toggleFold(row.key)} aria-expanded={!isFolded}
                aria-label={isFolded ? L.showTasks(kids.length) : L.hideTasks} title={isFolded ? L.showTasks(kids.length) : L.hideTasks}>
                <DisclosureIcon open={!isFolded} />
              </button>
            )}
            <button type="button" className={styles.whatOpen} onClick={() => onOpen(row)} title={row.context ? `${row.title} · ${row.context}` : row.title}>
              <span aria-hidden="true">{source.icon}</span>
              <span className={styles.whatTitle}>{row.title}</span>
            </button>
            {kids.length > 0 && isFolded && <span className={styles.kidCount}>{L.tasksCount(kids.length)}</span>}
            {row.plan?.important && <span className={styles.flag} role="img" aria-label={L.important}>{ITEM_FLAG_ICON.important}</span>}
          </div>
          <div className={styles.track} style={{ width }}>
            {parent?.when && (
              <span className={styles.anchorMark} aria-hidden="true"
                style={{ left: x(parent.when), width: x(parent.plan!.endDate ?? parent.when) - x(parent.when) + px }} />
            )}
            {dated && bar(row)}
          </div>
        </div>
        {!isFolded && kids.map((k) => line(k, row))}
      </div>
    );
  };

  const band = (title: string, list: OverviewRow[], important = false) => list.length > 0 && (
    <section className={`${styles.band} ${important ? styles.importantBand : ''}`} aria-label={title}>
      <div className={styles.bandHead} style={{ width: LABEL_W + width }}>
        <span className={styles.bandTitle}>{important && <span aria-hidden="true">{ITEM_FLAG_ICON.important} </span>}{title}</span>
      </div>
      {list.map((r) => line(r))}
    </section>
  );

  const nothingDated = bands.important.length + bands.due.length === 0;

  return (
    <div className={styles.runway} data-dragging={drag ? '' : undefined}>
      <div className={styles.toolbar}>
        <div className={styles.zooms} role="group" aria-label={L.zoom}>
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} className={`${styles.zoomBtn} ${zoom === z ? styles.zoomOn : ''}`} onClick={() => setZoom(z)}>{L.zooms[z]}</button>
          ))}
        </div>
        <button type="button" className={styles.todayBtn} onClick={scrollToToday}>{L.today}</button>
      </div>

      {nothingDated ? <p className={styles.empty}>{L.empty}</p> : (
        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.canvas} style={{ width: LABEL_W + width, ['--label-w' as string]: `${LABEL_W}px` }}>
            <div className={styles.axis}>
              <div className={styles.axisCorner} />
              <div className={styles.axisTrack} style={{ width }}>
                {ticks.map((t) => (
                  <span key={t.date} className={`${styles.tick} ${t.major ? styles.tickMajor : ''}`} style={{ left: x(t.date) }}>{t.label}</span>
                ))}
              </div>
            </div>
            <div className={styles.todayLine} style={{ left: LABEL_W + x(today) + px / 2 }} aria-hidden="true" />
            {band(L.important, bands.important, true)}
            {band(L.due, bands.due)}
          </div>
        </div>
      )}

      {bands.noDate.length > 0 && (
        <section className={styles.tray} aria-label={L.noDate}>
          <span className={styles.bandTitle} title={L.noDateHint}>{L.noDate} <span className={styles.count}>{bands.noDate.length}</span></span>
          <div className={styles.chips}>
            {bands.noDate.map((r) => (
              <button key={r.key} type="button" className={styles.chip} onClick={() => onOpen(r)} title={r.context ?? undefined}>
                <span aria-hidden="true">{SOURCE_BY_KEY[r.source].icon}</span> {r.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Labels along the top: each day (Week), each Monday (Month) or each month's first (Quarter).
function axisTicks(start: string, days: number, zoom: Zoom): { date: string; label: string; major: boolean }[] {
  const out: { date: string; label: string; major: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const date = shift(start, i);
    const d = new Date(`${date}T00:00:00Z`);
    const first = d.getUTCDate() === 1;
    if (zoom === 'week') out.push({ date, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }), major: d.getUTCDay() === 1 });
    else if (zoom === 'month' && (d.getUTCDay() === 1 || first)) out.push({ date, label: first ? d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) : String(d.getUTCDate()), major: first });
    else if (zoom === 'quarter' && first) out.push({ date, label: d.toLocaleDateString(undefined, { month: 'short', year: d.getUTCMonth() === 0 ? 'numeric' : undefined, timeZone: 'UTC' }), major: true });
  }
  return out;
}


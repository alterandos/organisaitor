import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { CloseIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { FILED_KINDS, filedIcon, filedUnder, moveFiled, openFiled, type FiledItem, type FiledKind } from '@/services/endeavourFiling';
import { endeavourSubtree } from '@/utils/endeavourGraph';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import styles from './EndeavourContents.module.css';

// Everything filed under an Endeavour, by kind (agreed with the user 2026-10-30): the home shows
// what matters now, this shows all of it. Any one opens where it's edited; several chosen can be
// moved to another Endeavour at once (Undo in the toast). Read from the filing registry
// (services/endeavourFiling.ts), so a new kind of thing filed under Endeavours appears here too.

const L = LABELS.endeavourContents;
const K = LABELS.restructure.kinds;

// Re-render when anything that can be filed changes (the registry reads the stores directly).
function useFilingVersion() {
  useTaskStore((s) => s.tasks); useTaskStore((s) => s.collections);
  useCalendarStore((s) => s.events); useCalendarStore((s) => s.reminders); useCalendarStore((s) => s.deadlines);
  useNoteStore((s) => s.notes); useNoteStore((s) => s.noteTags); useNoteStore((s) => s.structuredTagEntries);
  useListStore((s) => s.lists); useScheduleStore((s) => s.schedules); useGoalStore((s) => s.goals);
}

export function EndeavourContentsModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const contentsFor = useUIStore((s) => s.contentsFor);
  const collections = useTaskStore((s) => s.collections);
  useFilingVersion();
  const [kind, setKind] = useState<FiledKind | null>(() => (contentsFor?.kind as FiledKind | null) ?? null);
  const [withParts, setWithParts] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState<CollectionId | null>(null);
  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => closeModal());

  const id = contentsFor?.id;
  const c = id ? collections[id] : undefined;
  const scope = useMemo(() => (id ? (withParts ? [...endeavourSubtree(id, collections)] : [id]) : []), [id, withParts, collections]);
  const all: FiledItem[] = scope.flatMap((x) => filedUnder(x));
  if (!c) return null;

  const counts = new Map<FiledKind, number>();
  for (const i of all) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const shown = (kind ? all.filter((i) => i.kind === kind) : all).sort((a, b) => a.title.localeCompare(b.title));
  const keyOf = (i: FiledItem) => `${i.kind}:${i.id}`;
  const picked = shown.filter((i) => chosen.has(keyOf(i)));
  const toggle = (i: FiledItem) => setChosen((prev) => { const n = new Set(prev); if (n.has(keyOf(i))) n.delete(keyOf(i)); else n.add(keyOf(i)); return n; });
  const targets = Object.values(collections).filter((x) => (x.kind === 'project' || x.kind === 'list') && !x.archivedAt && x.id !== c.id);

  function open(i: FiledItem) { closeModal(); openFiled(i); }
  function move() {
    if (!picked.length) return;
    const undo = moveFiled(picked, moveTo);
    setChosen(new Set());
    showToast({ message: L.moved(picked.length, moveTo ? collections[moveTo]?.name ?? '' : L.nowhere), actions: [{ label: L.undo, onClick: undo }] });
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="contents-title">
        <div className={styles.header}>
          <h2 id="contents-title" className={styles.title}>{L.title(c.name)}</h2>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.close}><CloseIcon /></button>
        </div>
        <div className={styles.filters} role="group" aria-label={L.kinds}>
          <button type="button" className={`${styles.chip} ${kind === null ? styles.chipOn : ''}`} aria-pressed={kind === null} onClick={() => setKind(null)}>{L.all} · {all.length}</button>
          {FILED_KINDS.filter((k) => counts.get(k.kind)).map((k) => (
            <button key={k.kind} type="button" className={`${styles.chip} ${kind === k.kind ? styles.chipOn : ''}`} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              {k.icon} {K[k.kind]} · {counts.get(k.kind)}
            </button>
          ))}
          <label className={styles.check}><input type="checkbox" checked={withParts} onChange={(e) => setWithParts(e.target.checked)} /> {L.withParts}</label>
        </div>
        <div className={styles.body}>
          {shown.length === 0 ? <p className={styles.empty}>{L.empty}</p> : (
            <ul className={styles.rows}>
              {shown.map((i) => (
                <li key={keyOf(i)} className={styles.row}>
                  <input type="checkbox" checked={chosen.has(keyOf(i))} onChange={() => toggle(i)} aria-label={`${L.choose}: ${i.title}`} />
                  <span aria-hidden>{filedIcon(i.kind)}</span>
                  <button type="button" className={styles.rowTitle} onClick={() => open(i)} title={L.open}>{i.title}</button>
                  {i.endeavourId !== c.id && <span className={styles.from}>{L.inPart(collections[i.endeavourId as CollectionId]?.name ?? '')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.footer}>
          <span className={styles.hint}>{L.chosen(picked.length)}</span>
          <span className={styles.label}>{L.moveTo}</span>
          <div className={styles.picker}><CollectionPicker collections={targets} value={moveTo} onChange={setMoveTo} noneLabel={L.nowhere} /></div>
          <button type="button" className={styles.btn} disabled={!picked.length} onClick={move}>{L.move}</button>
          <span className={styles.spacer} />
          <button type="button" className={styles.primary} onClick={closeModal}>{L.done}</button>
        </div>
      </div>
    </div>
  );
}

// "12 Tasks · 8 Events · 3 Notebooks": what an Endeavour holds, each opening the view on that kind.
// Shown in its edit panes (the ordinary editor, the subject and semester editors).
export function EndeavourContentsSummary({ id }: { id: CollectionId }) {
  useFilingVersion();
  const items = filedUnder(id);
  const counts = FILED_KINDS.map((k) => [k, items.filter((i) => i.kind === k.kind).length] as const).filter(([, n]) => n > 0);
  const show = useUIStore((s) => s.showEndeavourContents);
  return (
    <div className={styles.summary} role="group" aria-label={L.summary}>
      <span className={styles.label}>{L.summary}</span>
      {counts.length === 0 ? <span className={styles.hint}>{L.empty}</span> : counts.map(([k, n]) => (
        <button key={k.kind} type="button" className={styles.chip} onClick={() => show(id, k.kind)}>{k.icon} {n} {K[k.kind]}</button>
      ))}
      {counts.length > 0 && <button type="button" className={styles.linkBtn} onClick={() => show(id)}>{L.manage}</button>}
    </div>
  );
}

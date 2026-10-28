import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useGoalStore } from '@/store/goalStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { DateInput } from '@/components/DateInput/DateInput';
import { CloseIcon } from '@/components/Icons';
import { isRhythm, rhythmStreams } from '@/utils/rhythms';
import { LABELS } from '@/config/labels';
import type { CollectionId, FieldSchema, GoalMeasure, GoalStatus } from '@/types';
import styles from './GoalModal.module.css';

// Making or editing a goal (docs/features/endeavours.md phase 5): what's wanted, for which
// Endeavour, by when, and how it's measured. Editing, it also settles it (achieved, missed,
// dropped) or reopens it; that's always the person's call.

const L = LABELS.goals;
type Kind = GoalMeasure['kind'];
const KINDS: Kind[] = ['manual', 'consistency', 'tracker', 'completion'];
const NUMERIC = new Set<FieldSchema['type']>(['number', 'duration', 'rating']);
// A duration is stored in seconds and entered in hours.
const toInput = (f: FieldSchema | undefined, v: number) => (f?.type === 'duration' ? v / 3600 : v);
const fromInput = (f: FieldSchema | undefined, v: number) => (f?.type === 'duration' ? Math.round(v * 3600) : v);

export function GoalModal() {
  const editingId  = useUIStore((s) => s.editingGoalId);
  const pendingFor = useUIStore((s) => s.pendingGoalEndeavourId);
  const closeModal = useUIStore((s) => s.closeModal);
  const goals      = useGoalStore((s) => s.goals);
  const collections = useTaskStore((s) => s.collections);
  const editing    = editingId ? goals[editingId] : undefined;
  const m0         = editing?.measure;

  const [title, setTitle]   = useState(() => editing?.title ?? '');
  const [target, setTarget] = useState<CollectionId | null>(() => (editing?.target.id ?? pendingFor) as CollectionId | null);
  const [by, setBy]         = useState(() => editing?.by ?? '');
  const [kind, setKind]     = useState<Kind>(() => m0?.kind ?? 'manual');
  // Each kind's settings, kept apart so switching kind and back loses nothing.
  const [manual, setManual] = useState(() => (m0?.kind === 'manual' ? m0 : { kind: 'manual' as const, unit: null as string | null, target: null as number | null, direction: 'atLeast' as const }));
  const [consistency, setConsistency] = useState(() => (m0?.kind === 'consistency' ? m0 : null));
  const [tracker, setTracker] = useState(() => (m0?.kind === 'tracker' ? m0 : null));
  const [milestonesOnly, setMilestonesOnly] = useState(() => (m0?.kind === 'completion' ? m0.milestonesOnly : false));
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const endeavours = Object.values(collections).filter((c) => (c.kind === 'project' || c.kind === 'list'));
  const rhythms = Object.values(collections).filter((c) => isRhythm(c) && !c.archivedAt).sort((a, b) => a.name.localeCompare(b.name));
  const trackers = Object.values(collections)
    .filter((c) => c.kind === 'tracker' && !c.archivedAt && (c.fieldSchema ?? []).some((f) => NUMERIC.has(f.type)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cons = consistency ?? (rhythms[0] ? { kind: 'consistency' as const, rhythmId: rhythms[0].id, streamId: null, count: 4, outOf: 5 } : null);
  const firstField = (id: string) => collections[id as CollectionId]?.fieldSchema?.find((f: FieldSchema) => NUMERIC.has(f.type));
  const trk = tracker ?? (trackers[0] ? { kind: 'tracker' as const, trackerId: trackers[0].id, fieldId: firstField(trackers[0].id)!.id, target: 0, direction: 'atLeast' as const, aggregate: 'sum' as const, period: 'week' as const } : null);
  const trkField = trk ? collections[trk.trackerId]?.fieldSchema?.find((f) => f.id === trk.fieldId) : undefined;

  const measure: GoalMeasure | null =
    kind === 'manual' ? manual
    : kind === 'consistency' ? cons
    : kind === 'tracker' ? trk
    : { kind: 'completion', milestonesOnly };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !target || !measure) return;
    const data = { title: title.trim(), target: { type: 'endeavour' as const, id: target }, by: by || null, measure };
    if (editing) useGoalStore.getState().updateGoal(editing.id, data);
    else useGoalStore.getState().addGoal(data);
    closeModal();
  }

  function settle(status: GoalStatus) {
    if (!editing) return;
    useGoalStore.getState().setGoalStatus(editing.id, status);
    closeModal();
  }

  async function handleDelete() {
    if (!editing) return;
    // A goal is never empty: what it's for and how it's measured are its content (it goes to the Recycling Bin).
    if (!(await confirmDelete(L.noun.toLowerCase(), editing.title, undefined, { empty: false }))) return;
    useGoalStore.getState().deleteGoal(editing.id);
    closeModal();
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="goal-title">
        <div className={styles.header}>
          <span id="goal-title" className={styles.title}>
            🎯 {editing ? L.editTitle : L.newTitle}
            {editing && editing.status !== 'active' && <span className={styles.badge}>{L.statuses[editing.status]}</span>}
          </span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.cancel}><CloseIcon /></button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.body}>
            <label className={styles.field}>
              <span className={styles.label}>{L.what}</span>
              <input className={styles.input} value={title} placeholder={L.whatPlaceholder} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <span className={styles.label}>{L.endeavour}</span>
                <CollectionPicker collections={endeavours} value={target} onChange={(id) => setTarget(id)} noneLabel={`— ${LABELS.collection} —`} />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>{L.by}</span>
                <DateInput className={styles.input} value={by} onChange={setBy} aria-label={L.by} />
              </div>
            </div>

            <fieldset className={styles.group}>
              <legend className={styles.label}>{L.measure}</legend>
              <div className={styles.kinds}>
                {KINDS.map((k) => (
                  <label key={k} className={`${styles.kind} ${kind === k ? styles.kindOn : ''}`}>
                    <input type="radio" name="goal-measure" checked={kind === k} onChange={() => setKind(k)} />
                    <span>{L.measures[k]}</span>
                  </label>
                ))}
              </div>
              <p className={styles.hint}>{L.measureHints[kind]}</p>

              {kind === 'manual' && (
                <div className={styles.row}>
                  <select className={styles.select} aria-label={L.target} value={manual.direction} onChange={(e) => setManual({ ...manual, direction: e.target.value as 'atLeast' | 'atMost' })}>
                    <option value="atLeast">{L.atLeast}</option>
                    <option value="atMost">{L.atMost}</option>
                  </select>
                  <input
                    className={styles.inputSmall} type="number" aria-label={L.target} placeholder={L.noTarget}
                    value={manual.target ?? ''} onChange={(e) => setManual({ ...manual, target: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <input className={styles.inputSmall} aria-label={L.unit} placeholder={L.unitPlaceholder} value={manual.unit ?? ''} onChange={(e) => setManual({ ...manual, unit: e.target.value || null })} />
                </div>
              )}

              {kind === 'consistency' && (cons ? (
                <div className={styles.row}>
                  <select className={styles.select} aria-label={L.rhythm} value={cons.rhythmId} onChange={(e) => setConsistency({ ...cons, rhythmId: e.target.value as CollectionId, streamId: null })}>
                    {rhythms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <select className={styles.select} aria-label={L.anyStream} value={cons.streamId ?? ''} onChange={(e) => setConsistency({ ...cons, streamId: e.target.value || null })}>
                    <option value="">{L.anyStream}</option>
                    {collections[cons.rhythmId] && rhythmStreams(collections[cons.rhythmId]).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <span className={styles.hint}>{L.count}</span>
                  <input className={styles.tiny} type="number" min={1} aria-label={L.count} value={cons.count} onChange={(e) => setConsistency({ ...cons, count: Math.max(1, Number(e.target.value) || 1) })} />
                  <span className={styles.hint}>{L.outOf}</span>
                  <input className={styles.tiny} type="number" min={1} aria-label={L.outOf} value={cons.outOf} onChange={(e) => setConsistency({ ...cons, outOf: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
              ) : <p className={styles.hint}>{L.noRhythms}</p>)}

              {kind === 'tracker' && (trk ? (
                <div className={styles.row}>
                  <select className={styles.select} aria-label={L.tracker} value={trk.trackerId} onChange={(e) => setTracker({ ...trk, trackerId: e.target.value as CollectionId, fieldId: firstField(e.target.value)!.id })}>
                    {trackers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select className={styles.select} aria-label={L.field} value={trk.fieldId} onChange={(e) => setTracker({ ...trk, fieldId: e.target.value })}>
                    {(collections[trk.trackerId]?.fieldSchema ?? []).filter((f) => NUMERIC.has(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select className={styles.select} aria-label={L.aggregate} value={trk.aggregate} onChange={(e) => setTracker({ ...trk, aggregate: e.target.value as 'latest' | 'best' | 'sum' })}>
                    {(['sum', 'best', 'latest'] as const).map((a) => <option key={a} value={a}>{L.aggregates[a]}</option>)}
                  </select>
                  {trk.aggregate === 'sum' && (
                    <select className={styles.select} aria-label={L.aggregate} value={trk.period} onChange={(e) => setTracker({ ...trk, period: e.target.value as 'week' | 'month' | 'all' })}>
                      {(['week', 'month', 'all'] as const).map((p) => <option key={p} value={p}>{L.periods[p]}</option>)}
                    </select>
                  )}
                  <select className={styles.select} aria-label={L.target} value={trk.direction} onChange={(e) => setTracker({ ...trk, direction: e.target.value as 'atLeast' | 'atMost' })}>
                    <option value="atLeast">{L.atLeast}</option>
                    <option value="atMost">{L.atMost}</option>
                  </select>
                  <input
                    className={styles.inputSmall} type="number" aria-label={L.target}
                    value={toInput(trkField, trk.target)} onChange={(e) => setTracker({ ...trk, target: fromInput(trkField, Number(e.target.value) || 0) })}
                  />
                  {trkField?.type === 'duration' ? <span className={styles.hint}>h</span> : trkField?.unit && <span className={styles.hint}>{trkField.unit}</span>}
                </div>
              ) : <p className={styles.hint}>{L.noTrackers}</p>)}

              {kind === 'completion' && (
                <label className={styles.check}>
                  <input type="checkbox" checked={milestonesOnly} onChange={(e) => setMilestonesOnly(e.target.checked)} /> {L.milestonesOnly}
                </label>
              )}
            </fieldset>
          </div>

          <div className={styles.actions}>
            {editing && (editing.status === 'active' ? (
              <>
                <button type="button" className={styles.secondaryBtn} onClick={() => settle('achieved')}>{L.markAchieved}</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => settle('missed')}>{L.markMissed}</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => settle('dropped')}>{L.drop}</button>
              </>
            ) : (
              <button type="button" className={styles.secondaryBtn} onClick={() => settle('active')}>{L.reopen}</button>
            ))}
            {editing && <button type="button" className={styles.dangerBtn} onClick={handleDelete}>{L.delete}</button>}
            <span className={styles.spacer} />
            <button type="button" className={styles.secondaryBtn} onClick={closeModal}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!title.trim() || !target || !measure}>{editing ? L.save : L.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

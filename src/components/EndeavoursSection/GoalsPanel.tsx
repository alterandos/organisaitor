import { useState } from 'react';
import { useGoalStore } from '@/store/goalStore';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { daysLeft, goalProgress, goalSuggestion, goalsOf, type GoalSnapshot } from '@/utils/goals';
import { EditIcon } from '@/components/Icons';
import type { Goal } from '@/types';
import styles from './EndeavoursSection.module.css';

// An Endeavour's goals on its home (docs/features/endeavours.md phase 5): how far along each is,
// worked out from what the app holds; a check-in for one measured by hand; and what's suggested
// (reached it: achieved? past its date: missed?), which the person settles.

const L = LABELS.goals;

function useGoalSnapshot(): GoalSnapshot {
  const tasks = useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  const entries = useTrackerStore((s) => s.entries);
  const schedules = useScheduleStore((s) => s.schedules);
  return { tasks, collections, entries, schedules };
}

export function GoalsPanel({ endeavourId, today }: { endeavourId: string; today: string }) {
  const goals = useGoalStore((s) => s.goals);
  const snap = useGoalSnapshot();
  const list = goalsOf(goals, endeavourId);
  if (list.length === 0) return null;
  return (
    <section className={styles.goals} aria-label={L.title}>
      <h3 className={styles.panelTitle}>{L.title}</h3>
      <div className={styles.goalCards}>
        {list.map((g) => <GoalCard key={g.id} goal={g} snap={snap} today={today} />)}
      </div>
    </section>
  );
}

function GoalCard({ goal, snap, today }: { goal: Goal; snap: GoalSnapshot; today: string }) {
  const [checking, setChecking] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const progress = goalProgress(goal, snap, today);
  const suggestion = goalSuggestion(goal, progress, today);
  const left = daysLeft(goal, today);
  const settled = goal.status !== 'active';
  const pct = progress.fraction === null ? null : Math.round(progress.fraction * 100);
  const setStatus = (s: Goal['status']) => useGoalStore.getState().setGoalStatus(goal.id, s);

  function record(e: React.FormEvent) {
    e.preventDefault();
    if (value === '' && !note.trim()) return;
    useGoalStore.getState().addCheckIn(goal.id, { date: today, value: value === '' ? null : Number(value), note: note.trim() || null });
    setValue(''); setNote(''); setChecking(false);
  }

  return (
    <article className={`${styles.goalCard} ${settled ? styles.goalSettled : ''}`} aria-label={goal.title}>
      <div className={styles.goalHead}>
        <span className={styles.goalTitle}>🎯 {goal.title}</span>
        {settled && <span className={goal.status === 'achieved' ? styles.pillOk : styles.pillMuted}>{L.statuses[goal.status]}</span>}
        <button type="button" className={styles.iconBtn} aria-label={`${L.edit}: ${goal.title}`} title={L.edit} onClick={() => useUIStore.getState().openEditGoal(goal.id)}>
          <EditIcon />
        </button>
      </div>
      {pct !== null && (
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={goal.title}>
          <div className={`${styles.barFill} ${progress.reached ? styles.barDone : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className={styles.goalMeta}>
        {progress.text}
        {goal.by && !settled && <> · {formatDate(goal.by + 'T00:00:00')}{left !== null && <> ({L.daysLeft(left)})</>}</>}
      </p>
      {suggestion === 'achieved' && (
        <p className={styles.goalSuggest}>{L.suggestAchieved} <button type="button" className={styles.linkBtn} onClick={() => setStatus('achieved')}>{L.markAchieved}</button></p>
      )}
      {suggestion === 'overdue' && (
        <p className={styles.goalSuggest}>{L.suggestOverdue} <button type="button" className={styles.linkBtn} onClick={() => setStatus('missed')}>{L.markMissed}</button></p>
      )}
      {!settled && goal.measure.kind === 'manual' && (checking ? (
        <form className={styles.checkIn} onSubmit={record}>
          <input className={styles.checkValue} type="number" step="any" aria-label={L.checkInValue} placeholder={L.checkInValue} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <input className={styles.checkNote} aria-label={L.checkInNote} placeholder={L.checkInNote} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className={styles.btn}>{L.checkInSave}</button>
          <button type="button" className={styles.linkBtn} onClick={() => setChecking(false)}>{L.cancel}</button>
        </form>
      ) : (
        <button type="button" className={styles.ghost} onClick={() => setChecking(true)}>+ {L.checkIn}</button>
      ))}
    </article>
  );
}

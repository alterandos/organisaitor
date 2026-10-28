import type { Collection, Goal, ScheduleTemplate, Task, TrackerEntry } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { endeavourSubtree } from '@/utils/endeavourGraph';
import { formatFieldValue } from '@/utils/itemTypes';
import { rhythmOccurrences, rhythmStreams, tickIndex, weekStart, isRhythm } from '@/utils/rhythms';
import { LABELS } from '@/config/labels';

// How far along a goal is (docs/features/endeavours.md phase 5), pure: worked out each time from
// what the app already holds (check-ins, a rhythm's ticks, a tracker's entries, the Endeavour's
// tasks), never stored. What's suggested (achieved, gone past its date) is here too; setting the
// status is the person's (services through goalStore).

const L = LABELS.goals;

export interface GoalSnapshot {
  tasks:       Record<string, Task>;
  collections: Record<string, Collection>;
  entries:     Record<string, TrackerEntry>;
  schedules:   Record<string, ScheduleTemplate>;
}

export interface GoalProgress {
  value:    number | null;   // where it stands (null: nothing to go on yet)
  target:   number | null;
  fraction: number | null;   // 0..1 toward the target, for a bar
  reached:  boolean;
  text:     string;          // "7 of the last 10 done", "72% (target 75%)"
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (n: number) => Math.round(n * 100) / 100;

function toward(value: number, target: number, direction: 'atLeast' | 'atMost'): { fraction: number; reached: boolean } {
  if (direction === 'atLeast') return { fraction: target > 0 ? clamp(value / target) : 1, reached: value >= target };
  return { fraction: value <= target ? 1 : clamp(target / value), reached: value <= target };
}

// How many past occurrences a consistency goal looks back over at most (a year of a daily stream).
const LOOKBACK_DAYS = 366;

export function goalProgress(goal: Goal, snap: GoalSnapshot, today: string): GoalProgress {
  const m = goal.measure;

  if (m.kind === 'manual') {
    const last = [...goal.checkIns].filter((c) => c.value !== null).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const unit = !m.unit ? '' : m.unit === '%' ? '%' : ` ${m.unit}`;
    if (!last || last.value === null) return { value: null, target: m.target, fraction: null, reached: false, text: L.noCheckIns };
    if (m.target === null) return { value: last.value, target: null, fraction: null, reached: false, text: `${round(last.value)}${unit}` };
    const t = toward(last.value, m.target, m.direction);
    return { value: last.value, target: m.target, ...t, text: L.ofTarget(`${round(last.value)}${unit}`, `${round(m.target)}${unit}`) };
  }

  if (m.kind === 'consistency') {
    const rhythm = snap.collections[m.rhythmId];
    if (!isRhythm(rhythm)) return { value: null, target: m.count, fraction: null, reached: false, text: L.gone };
    const ticks = tickIndex(snap.entries, snap.collections);
    // The latest `outOf` occurrences up to today that counted (one marked not needed doesn't).
    const past = rhythmOccurrences(rhythm, snap.schedules, ticks, addDaysToIso(today, -LOOKBACK_DAYS), today, today)
      .filter((o) => (!m.streamId || o.stream.id === m.streamId) && o.state !== 'notNeeded' && o.state !== 'upcoming')
      .slice(-m.outOf);
    const done = past.filter((o) => o.state === 'done').length;
    const stream = m.streamId ? rhythmStreams(rhythm).find((s) => s.id === m.streamId)?.label ?? rhythm.name : rhythm.name;
    return { value: done, target: m.count, fraction: clamp(done / Math.max(1, m.count)), reached: done >= m.count, text: L.consistencyText(done, past.length, stream) };
  }

  if (m.kind === 'tracker') {
    const tracker = snap.collections[m.trackerId];
    const field = tracker?.fieldSchema?.find((f) => f.id === m.fieldId);
    if (!tracker || !field) return { value: null, target: m.target, fraction: null, reached: false, text: L.gone };
    const from = m.period === 'week' ? weekStart(today) : m.period === 'month' ? `${today.slice(0, 7)}-01` : '';
    const entries = Object.values(snap.entries)
      .filter((e) => e.trackerId === m.trackerId && e.date <= today && e.date >= from && num(e.data?.[m.fieldId]) !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const values = entries.map((e) => num(e.data[m.fieldId])!);
    if (values.length === 0) return { value: null, target: m.target, fraction: m.aggregate === 'sum' && m.direction === 'atLeast' ? 0 : null, reached: false, text: L.noEntries };
    const value = m.aggregate === 'sum' ? values.reduce((a, b) => a + b, 0)
      : m.aggregate === 'latest' ? values[values.length - 1]
      : m.direction === 'atLeast' ? Math.max(...values) : Math.min(...values);
    const t = toward(value, m.target, m.direction);
    return { value, target: m.target, ...t, text: L.ofTarget(formatFieldValue(field, value), formatFieldValue(field, m.target)) };
  }

  // completion: the Endeavour's own tasks and its parts', top-level ones (a sub-task is part of its task)
  const scope = endeavourSubtree(goal.target.id, snap.collections);
  const tasks = Object.values(snap.tasks).filter((t) => !t.archived && !t.parentId && !!t.collectionId && scope.has(t.collectionId)
    && (!m.milestonesOnly || t.kind === 'milestone'));
  const done = tasks.filter((t) => t.completed).length;
  return {
    value: done, target: tasks.length, fraction: tasks.length ? done / tasks.length : null,
    reached: tasks.length > 0 && done === tasks.length,
    text: L.completionText(done, tasks.length, m.milestonesOnly),
  };
}

// What the app suggests about an active goal: reached it (mark achieved?), or gone past its date
// without (mark missed?). Nothing for a goal already settled.
export type GoalSuggestion = 'achieved' | 'overdue' | null;

export function goalSuggestion(goal: Goal, progress: GoalProgress, today: string): GoalSuggestion {
  if (goal.status !== 'active') return null;
  if (progress.reached) return 'achieved';
  if (goal.by && goal.by < today) return 'overdue';
  return null;
}

// Days left to its date (negative once past), or null without one.
export function daysLeft(goal: Goal, today: string): number | null {
  if (!goal.by) return null;
  return Math.round((Date.parse(goal.by + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
}

// The goals of an Endeavour (its own, not its parts'), active first, then by date.
export function goalsOf(goals: Record<string, Goal>, endeavourId: string): Goal[] {
  const rank = (g: Goal) => (g.status === 'active' ? 0 : 1);
  return Object.values(goals)
    .filter((g) => g.target.type === 'endeavour' && g.target.id === endeavourId)
    .sort((a, b) => rank(a) - rank(b) || (a.by ?? '9999').localeCompare(b.by ?? '9999') || a.title.localeCompare(b.title));
}

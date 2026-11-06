import { itemOccurrences } from '@/utils/itemOccurrences';
import { addDaysToIso } from '@/utils/date';
import type { CalendarDeadline, CalendarEvent, EventTaskRule, ItemLink, Task } from '@/types';

// Tasks for each date of an event (the user, 2026-11-04: "prepare for the lecture" for every
// lecture, gone when one is cancelled). Pure: what the watcher (services/eventTaskRules.ts) should
// make, move and take away, from the events, their rules and the tasks already made.
// - A task appears LEAD_DAYS before it's due (rolling, decided with the user: not the whole term
//   at once), and only for a date not yet given one (`made`), so one the person deleted stays gone.
// - A date cancelled (skipped, a break, the series deleted or ended) takes its open task away; a
//   task already done stays. A date moved ("only this one") moves its task; dates the person set
//   on the task themselves are left alone.
// - Before: due N days before the class (at its start time on the day). After: from the class,
//   due N days after it.

export const LEAD_DAYS = 7;
const AROUND = 60;          // how far either side of today a task's date is checked
const KEEP_MADE = 120;      // `made` dates older than this are forgotten

export interface RuleOccurrence { key: string; date: string; time: string | null }

// The live dates of an event in [from, to], each by its key (its date in the series, so a date
// moved "only this one" keeps its key) at its actual date. A one-off event is its one date.
export function eventOccurrences(e: CalendarEvent, events: Record<string, CalendarEvent>, from: string, to: string): RuleOccurrence[] {
  if (e.archivedAt) return [];
  if (!e.repeat) return e.date >= from && e.date <= to ? [{ key: e.date, date: e.date, time: e.startTime }] : [];
  const deadlines: Record<string, CalendarDeadline> = {};
  return itemOccurrences([{ kind: 'class', item: e }], { events, deadlines }, from, to, from)
    .filter((o) => o.state !== 'skipped')
    .map((o) => ({ key: o.key.slice(o.key.indexOf('|') + 1), date: o.date, time: o.time }));
}

export function ruleDates(rule: EventTaskRule, occ: RuleOccurrence): Pick<Task, 'deadline' | 'deadlineTime' | 'scheduledAt'> {
  if (rule.side === 'before') {
    return { deadline: addDaysToIso(occ.date, -rule.days), deadlineTime: rule.days === 0 ? occ.time : null, scheduledAt: null };
  }
  return { deadline: addDaysToIso(occ.date, rule.days), deadlineTime: null, scheduledAt: occ.date };
}

export const ruleTaskTitle = (rule: EventTaskRule, e: CalendarEvent) => `${rule.title}: ${e.title}`;

// The link that says which date and rule made a task.
export const ruleLinkOf = (t: Task): ItemLink | undefined => (t.itemLinks ?? []).find((l) => l.targetType === 'event' && !!l.ruleId && !!l.occurrence);

export interface RulePlan {
  create: { event: CalendarEvent; rule: EventTaskRule; occ: RuleOccurrence; dates: ReturnType<typeof ruleDates> }[];
  move:   { taskId: string; dates: ReturnType<typeof ruleDates>; link: ItemLink }[];
  remove: string[];
  // Each rule's `made` list as it should now be, for the events whose rules changed.
  made:   { eventId: string; rules: EventTaskRule[] }[];
}

// Events whose rules make tasks: not a date taken out of a series (its series makes that date's).
const hosts = (events: Record<string, CalendarEvent>) =>
  Object.values(events).filter((e) => e.taskRules?.length && !(e.seriesId && !e.repeat) && !e.archivedAt);

// `now` (HH:MM): a task due earlier today isn't made either, so nothing is made already overdue
// (the user, 2026-11-05: a task for each date must never arrive in the past).
export function planRuleTasks(events: Record<string, CalendarEvent>, tasks: Record<string, Task>, today: string, now: string | null = null): RulePlan {
  const plan: RulePlan = { create: [], move: [], remove: [], made: [] };
  const from = addDaysToIso(today, -AROUND), to = addDaysToIso(today, AROUND);
  const occs = new Map<string, Map<string, RuleOccurrence>>();
  const occOf = (e: CalendarEvent) => {
    if (!occs.has(e.id)) occs.set(e.id, new Map(eventOccurrences(e, events, from, to).map((o) => [o.key, o])));
    return occs.get(e.id)!;
  };

  // The tasks already made, by event, rule and date.
  const existing = new Map<string, Task>();
  for (const t of Object.values(tasks)) {
    const l = ruleLinkOf(t);
    if (!l) continue;
    existing.set(`${l.targetId}|${l.ruleId}|${l.occurrence}`, t);
    const e = events[l.targetId as never] as CalendarEvent | undefined;
    const rule = e?.taskRules?.find((r) => r.id === l.ruleId);
    const open = !t.completed && !t.archived;
    if (!e || e.archivedAt || !rule) { if (open) plan.remove.push(t.id); continue; }
    if (l.occurrence! < from || l.occurrence! > to) continue;
    const occ = occOf(e).get(l.occurrence!);
    if (!occ) { if (open) plan.remove.push(t.id); continue; }
    // Only a move of the date moves the task: dates the person changed on the task are theirs.
    if (open && occ.date !== (l.at ?? l.occurrence)) plan.move.push({ taskId: t.id, dates: ruleDates(rule, occ), link: { ...l, at: occ.date } });
  }

  for (const e of hosts(events)) {
    let changed = false;
    const rules = e.taskRules!.map((rule) => {
      if (!rule.title.trim()) return rule;   // still being named
      const made = new Set((rule.made ?? []).filter((d) => d >= addDaysToIso(today, -KEEP_MADE)));
      if (made.size !== (rule.made ?? []).length) changed = true;
      for (const occ of occOf(e).values()) {
        const dates = ruleDates(rule, occ);
        if (!dates.deadline || dates.deadline < today || dates.deadline > addDaysToIso(today, LEAD_DAYS)) continue;
        if (dates.deadline === today && now && dates.deadlineTime && dates.deadlineTime <= now) continue;
        if (made.has(occ.key) || existing.has(`${e.id}|${rule.id}|${occ.key}`)) continue;
        plan.create.push({ event: e, rule, occ, dates });
        made.add(occ.key);
        changed = true;
      }
      return { ...rule, made: [...made].sort() };
    });
    if (changed) plan.made.push({ eventId: e.id, rules });
  }
  return plan;
}

// One row per rule where open tasks are listed (the user, 2026-11-04: weekly tasks mustn't crowd
// the Tasks list or Overview): the task due first stands for the others of its rule, which are
// under it (`folded`, by its id) to show on a click. Keeps the order given otherwise.
const ruleKeyOf = (t: Task) => { const l = ruleLinkOf(t); return l ? `${l.targetId}|${l.ruleId}` : null; };
export function foldRuleTasks<T extends Task>(tasks: T[]): { shown: T[]; folded: Map<string, T[]> } {
  const first = new Map<string, T>();
  for (const t of tasks) {
    const k = ruleKeyOf(t);
    if (!k) continue;
    const was = first.get(k);
    if (!was || (t.deadline ?? '9') < (was.deadline ?? '9')) first.set(k, t);
  }
  const folded = new Map<string, T[]>();
  const shown = tasks.filter((t) => {
    const k = ruleKeyOf(t);
    if (!k || first.get(k) === t) return true;
    const lead = first.get(k)!;
    folded.set(lead.id, [...(folded.get(lead.id) ?? []), t]);
    return false;
  });
  return { shown, folded };
}

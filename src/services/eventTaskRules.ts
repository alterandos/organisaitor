import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { addTaskWithCalendar, updateTaskLinked } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { isHydrating } from '@/services/sync/hydrating';
import { planRuleTasks, ruleTaskTitle } from '@/utils/eventTaskRules';
import { todayIso } from '@/utils/date';
import { log } from '@/utils/log';
import type { CalendarEventId, EventTaskRule, TaskId } from '@/types';

// Tasks for each date of an event (the rules are utils/eventTaskRules.ts): ONE watcher makes each
// task a week before it's due, moves it with its date, and takes an open one away (to the
// Recycling Bin) when its date is cancelled. Never make or remove these tasks anywhere else; a new
// way of changing an event needs nothing. Runs on any calendar or task change, once a day, and not
// while sync is merging (the merged state is applied once it's done).

let running = false;

export function applyRuleTasks(today = todayIso(), now: string | null = today === todayIso() ? new Date().toTimeString().slice(0, 5) : null): void {
  if (running) return;
  running = true;
  try {
    const plan = planRuleTasks(useCalendarStore.getState().events, useTaskStore.getState().tasks, today, now);
    if (!plan.create.length && !plan.move.length && !plan.remove.length && !plan.made.length) return;
    // `made` first, so a task made below is never made again even if something fails after.
    for (const m of plan.made) useCalendarStore.getState().updateEvent(m.eventId as CalendarEventId, { taskRules: m.rules });
    const ts = new Date().toISOString();
    for (const c of plan.create) {
      addTaskWithCalendar({
        title: ruleTaskTitle(c.rule, c.event), collectionId: c.event.collectionId, ...c.dates,
        itemLinks: [{ kind: c.rule.side === 'before' ? 'prepFor' : 'followUpOf', targetType: 'event', targetId: c.event.id, reason: null, createdAt: ts, occurrence: c.occ.key, ruleId: c.rule.id, at: c.occ.date }],
      });
    }
    for (const m of plan.move) {
      const t = useTaskStore.getState().tasks[m.taskId as TaskId];
      if (t) updateTaskLinked(t.id, { ...m.dates, itemLinks: (t.itemLinks ?? []).map((l) => (l.ruleId === m.link.ruleId && l.occurrence === m.link.occurrence ? m.link : l)) });
    }
    for (const id of plan.remove) deleteTaskWithCleanup(id as TaskId);
  } catch (e) {
    log.error('eventTaskRules', 'could not keep the tasks for each date in step', e);
  } finally {
    running = false;
  }
}

export function initEventTaskRules(): () => void {
  applyRuleTasks();
  const offCal = useCalendarStore.subscribe((s, prev) => { if (s.events !== prev.events && !isHydrating()) applyRuleTasks(); });
  const offTasks = useTaskStore.subscribe((s, prev) => { if (s.tasks !== prev.tasks && !isHydrating()) applyRuleTasks(); });
  // A new day brings the next dates into the week ahead.
  let day = todayIso();
  const timer = window.setInterval(() => { if (todayIso() !== day) { day = todayIso(); applyRuleTasks(); } }, 10 * 60_000);
  return () => { offCal(); offTasks(); window.clearInterval(timer); };
}

// Changing an event's rules (EventTaskRulesField): only through here, so `made` is kept.
export function setEventTaskRules(eventId: CalendarEventId, rules: EventTaskRule[]): void {
  useCalendarStore.getState().updateEvent(eventId, { taskRules: rules });
}

import { describe, expect, it } from 'vitest';
import { datedPatch, datedRule, defaultRule, eventPatch, eventRule, ruleKindsFor } from './notifyRule';

const dated = (o: Record<string, unknown>) => ({ notify: true, notifyMode: 'daysAt', notifyBeforeValue: null, notifyBeforeUnit: 'hours', notifyDaysBefore: 1, notifyAtTime: '17:00', time: null, ...o }) as never;

describe('reading and writing a calendar item’s notify setting', () => {
  it('reminders and deadlines: off, days before at a time, before their time, at their time', () => {
    expect(datedRule(dated({ notify: false }), 'reminder')).toEqual({ kind: 'off' });
    expect(datedRule(dated({}), 'deadline')).toEqual({ kind: 'daysAt', days: 1, at: '17:00' });
    expect(datedRule(dated({ time: '09:00', notifyMode: 'before', notifyBeforeValue: 2, notifyBeforeUnit: 'hours' }), 'deadline')).toEqual({ kind: 'before', value: 2, unit: 'hours' });
    expect(datedRule(dated({ time: '09:00', notifyMode: 'atTime' }), 'reminder')).toEqual({ kind: 'atTime' });
    expect(datedRule(dated({ time: '09:00', notifyMode: 'atTime' }), 'deadline')).toEqual({ kind: 'daysAt', days: 1, at: '17:00' });   // a deadline is never told at the moment
  });

  it('each rule written back reads the same', () => {
    for (const rule of [{ kind: 'off' }, { kind: 'before', value: 20, unit: 'minutes' }, { kind: 'daysAt', days: 3, at: '08:00' }, { kind: 'atTime' }] as const) {
      expect(datedRule(dated({ time: '10:00', ...datedPatch(rule) }), 'reminder')).toEqual(rule);
    }
    for (const rule of [{ kind: 'off' }, { kind: 'before', value: 2, unit: 'days' }, { kind: 'daysAt', days: 1, at: '18:30' }] as const) {
      expect(eventRule({ notifyBeforeValue: 1, notifyBeforeUnit: 'hours', notifyAtTime: null, notifyMode: 'before', startTime: '10:00', ...eventPatch(rule) })).toEqual(rule);
    }
  });

  it('what each item may use, and what Notify starts with', () => {
    expect(ruleKindsFor('reminder', true)).toEqual(['atTime', 'before', 'daysAt']);
    expect(ruleKindsFor('deadline', true)).toEqual(['before', 'daysAt']);
    expect(ruleKindsFor('event', false)).toEqual(['daysAt']);
    expect(defaultRule('event', true)).toEqual({ kind: 'before', value: 1, unit: 'hours' });
    expect(defaultRule('reminder', false)).toEqual({ kind: 'daysAt', days: 1, at: '17:00' });
  });
});

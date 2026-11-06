import { describe, expect, it } from 'vitest';
import { eventTypeIcon, kindPatch, YEARLY } from './calendarEventTypes';
import { eventRule } from '@/utils/notifyRule';
import { showAsOf } from '@/utils/showAs';
import type { CalendarEvent } from '@/types';

// What choosing a kind of event sets (2026-11-06, the user's corrections).
const plain = { repeat: null, quiet: false, background: false, travelMode: null };

describe('kinds of event', () => {
  it('Travel: Background (Quiet within one day), and ✈️ without having to choose a mode', () => {
    const p = kindPatch(plain, 'travel');
    expect(p).toMatchObject({ eventType: 'travel', quiet: true, background: true });
    const shown = { quiet: !!p.quiet, background: !!p.background };
    expect(showAsOf(shown, true)).toBe('background');
    expect(showAsOf(shown, false)).toBe('quiet');
    expect(eventTypeIcon({ eventType: 'travel', travelMode: null, icon: null })).toBe('✈️');
    expect(eventTypeIcon({ eventType: 'travel', travelMode: 'train', icon: null })).toBe('🚆');   // an imported one keeps its own
  });

  it('Birthday: all day, every year on its date forever, notified on the day at noon', () => {
    const p = kindPatch(plain, 'birthday');
    expect(p).toMatchObject({ eventType: 'birthday', startTime: null, endTime: null, repeat: YEARLY });
    expect(YEARLY).toEqual({ freq: 'yearly', interval: 1, endKind: 'forever', count: null, until: null });
    expect(eventRule({ ...p, startTime: null } as CalendarEvent)).toEqual({ kind: 'daysAt', days: 0, at: '12:00' });
  });
});

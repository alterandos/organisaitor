import { describe, expect, it } from 'vitest';
import { deriveNotifyBefore, minutesToNotify } from '@/utils/googleReminders';

describe('minutesToNotify', () => {
  it('prefers days when evenly divisible', () => {
    expect(minutesToNotify(1440)).toEqual({ value: 1, unit: 'days' });
    expect(minutesToNotify(2880)).toEqual({ value: 2, unit: 'days' });
  });

  it('prefers hours when evenly divisible but not a whole day', () => {
    expect(minutesToNotify(120)).toEqual({ value: 2, unit: 'hours' });
  });

  it('falls back to minutes', () => {
    expect(minutesToNotify(45)).toEqual({ value: 45, unit: 'minutes' });
  });
});

describe('deriveNotifyBefore', () => {
  it("copies the event's own popup override", () => {
    const out = deriveNotifyBefore({ useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }, undefined, false);
    expect(out).toEqual({ value: 15, unit: 'minutes' });
  });

  it('a non-popup-only override list is not "no popup reminders" — falls through to the fallback, not off', () => {
    // "Deliberately cleared" (off) only means an EMPTY overrides array; a non-empty list of
    // only email/SMS overrides still reaches the same fallback as no overrides at all.
    const out = deriveNotifyBefore({ useDefault: false, overrides: [{ method: 'email', minutes: 15 }] }, undefined, false);
    expect(out.value).toBe(30);
  });

  it('an empty overrides array (useDefault false) is treated as deliberately cleared — off', () => {
    const out = deriveNotifyBefore({ useDefault: false, overrides: [] }, undefined, false);
    expect(out.value).toBeNull();
  });

  it('useDefault true pulls from the calendar defaultReminders', () => {
    const out = deriveNotifyBefore({ useDefault: true }, { defaultReminders: [{ method: 'popup', minutes: 30 }] }, false);
    expect(out).toEqual({ value: 30, unit: 'minutes' });
  });

  it('deliberately cleared reminders (useDefault false, no overrides) stay off', () => {
    const out = deriveNotifyBefore({ useDefault: false, overrides: [] }, { defaultReminders: [{ method: 'popup', minutes: 30 }] }, false);
    expect(out.value).toBeNull();
  });

  it('several popups: the one closest to the start wins', () => {
    const out = deriveNotifyBefore(
      { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }] },
      undefined,
      false
    );
    expect(out.value).toBe(10);
  });

  it('a read-only calendar gets no fallback when nothing else applies', () => {
    const out = deriveNotifyBefore(undefined, { accessRole: 'reader' }, false);
    expect(out.value).toBeNull();
  });

  it('an unknown accessRole (older imports) is treated as the user\'s own — fallback applies', () => {
    const out = deriveNotifyBefore(undefined, {}, false);
    expect(out.value).toBe(30);
  });

  it('timed vs all-day fallback minutes differ (expressed via minutesToNotify\'s own unit choice)', () => {
    expect(deriveNotifyBefore(undefined, undefined, false).value).toBe(30);
    // 7*60 = 420 minutes, evenly divisible by 60 -> minutesToNotify expresses it as 7 hours.
    expect(deriveNotifyBefore(undefined, undefined, true).value).toBe(7);
    expect(deriveNotifyBefore(undefined, undefined, true).unit).toBe('hours');
  });

  it('a writer/owner calendar gets the fallback', () => {
    expect(deriveNotifyBefore(undefined, { accessRole: 'owner' }, false).value).toBe(30);
    expect(deriveNotifyBefore(undefined, { accessRole: 'writer' }, false).value).toBe(30);
  });
});

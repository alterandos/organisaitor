import { describe, expect, it } from 'vitest';
import { stravaActivityId, withStableStravaIds } from './fitnessIds';
import { importedEventId } from '@/services/calendarImport/ids';
import type { Activity } from '@/types/fitness';

const act = (o: Partial<Omit<Activity, 'id'>> & { id?: string }) => ({
  id: 'x', type: 'run', title: 'Run', startedAt: '2030-01-01', timezone: null, distanceMeters: null, movingTimeSeconds: null,
  elapsedTimeSeconds: null, averageSpeedMps: null, data: {}, notes: null, purposeIds: [], source: 'manual', sourceId: null,
  sourceRaw: null, archivedAt: null, createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z', ...o,
}) as Activity;

describe('Strava activity ids', () => {
  it('are the same on every device for one account, and differ between accounts', () => {
    expect(stravaActivityId('u1', '987')).toBe(stravaActivityId('u1', '987'));
    expect(stravaActivityId('u1', '987')).not.toBe(stravaActivityId('u2', '987'));
    expect(stravaActivityId('u1', '987')).not.toBe(stravaActivityId('u1', '988'));
  });

  it('the calendar import keeps the ids it had before the hash was shared', () => {
    // The value the old ids.ts gave (computed from it before the hash moved to utils/stableId.ts).
    expect(importedEventId('user-1', 'google:cal:evt')).toBe('imp_ofmfsdl7xp20o4t4jpumm');
  });

  it('an older random-id copy takes its stable id, or gives way to the stable one already here', () => {
    const stable = stravaActivityId('u1', '987');
    const old = act({ id: 'rand1', source: 'strava', sourceId: '987', updatedAt: '2030-01-01T00:00:00Z' });
    const manual = act({ id: 'm1' });
    expect(Object.keys(withStableStravaIds({ rand1: old, m1: manual }, 'u1')).sort()).toEqual(['m1', stable].sort());
    const cloud = act({ id: stable, source: 'strava', sourceId: '987', title: 'From the cloud', updatedAt: '2030-01-02T00:00:00Z' });
    const merged = withStableStravaIds({ rand1: old, [stable]: cloud }, 'u1');
    expect(Object.keys(merged)).toEqual([stable]);
    expect(merged[stable].title).toBe('From the cloud');
    const untouched = { m1: manual };
    expect(withStableStravaIds(untouched, 'u1')).toBe(untouched);
  });
});

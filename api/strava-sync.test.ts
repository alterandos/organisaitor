import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Math.floor(Date.parse('2030-01-01T00:00:00.000Z') / 1000);

const fake = vi.hoisted(() => {
  let connection: Record<string, unknown> | null = { access_token: 'old-token', refresh_token: 'refresh-1', expires_at: 0 };
  const updates: Record<string, unknown>[] = [];
  return {
    setConnection: (c: typeof connection) => { connection = c; },
    updates,
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: connection, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: () => { updates.push(patch); return Promise.resolve({ error: null }); } }),
      }),
    },
  };
});

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getUserClient: () => fake.client };
});

const refreshCalls: string[] = [];
vi.mock('./_lib/strava', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/strava')>();
  return {
    ...actual,
    refreshStravaToken: (refreshToken: string) => {
      refreshCalls.push(refreshToken);
      return Promise.resolve({ access_token: 'new-token', refresh_token: 'refresh-2', expires_at: NOW + 21_600, expires_in: 21_600 });
    },
  };
});

const { default: handler } = await import('./strava-sync');

const req = () => new Request('http://x/api/strava-sync', { method: 'POST', headers: { Authorization: 'Bearer good' } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  refreshCalls.length = 0;
  fake.updates.length = 0;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))));
});

describe('api/strava-sync', () => {
  it('401s with no bearer token', async () => {
    fake.setConnection(null);
    const res = await handler(new Request('http://x/api/strava-sync', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('405s on anything but POST', async () => {
    const res = await handler(new Request('http://x/api/strava-sync', { method: 'GET', headers: { Authorization: 'Bearer good' } }));
    expect(res.status).toBe(405);
  });

  it('404s when Strava isn\'t connected', async () => {
    fake.setConnection(null);
    const res = await handler(req());
    expect(res.status).toBe(404);
  });

  it('refreshes the token when it expires within the next 5 minutes, and persists the new one', async () => {
    fake.setConnection({ access_token: 'old-token', refresh_token: 'refresh-1', expires_at: NOW + 200 }); // < 300s away
    await handler(req());
    expect(refreshCalls).toEqual(['refresh-1']);
    expect(fake.updates[0]).toMatchObject({ access_token: 'new-token', refresh_token: 'refresh-2' });
    // The refreshed token, not the stale one, is what's used for the Strava API call.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer new-token');
  });

  it('does NOT refresh when the token is comfortably far from expiring', async () => {
    fake.setConnection({ access_token: 'old-token', refresh_token: 'refresh-1', expires_at: NOW + 3600 });
    await handler(req());
    expect(refreshCalls).toEqual([]);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token');
  });

  it('502s when the Strava activities API itself fails', async () => {
    fake.setConnection({ access_token: 'tok', refresh_token: 'r', expires_at: NOW + 3600 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))));
    const res = await handler(req());
    expect(res.status).toBe(502);
  });

  it('maps activities to the fitnessStore shape, using mapSportType and stringifying the id', async () => {
    fake.setConnection({ access_token: 'tok', refresh_token: 'r', expires_at: NOW + 3600 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { id: 999, name: 'Morning Run', sport_type: 'Run', start_date: '2030-01-01T06:00:00Z', distance: 5000, moving_time: 1500, elapsed_time: 1600, average_speed: 3.3 },
    ]), { status: 200 }))));
    const res = await handler(req());
    const { activities } = await res.json() as { activities: unknown[] };
    expect(activities).toEqual([{
      type: 'run', title: 'Morning Run', startedAt: '2030-01-01T06:00:00Z',
      distanceMeters: 5000, movingTimeSeconds: 1500, elapsedTimeSeconds: 1600, averageSpeedMps: 3.3,
      sourceId: '999', sourceRaw: expect.objectContaining({ id: 999 }),
    }]);
  });
});

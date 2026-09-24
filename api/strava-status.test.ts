import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let user: { id: string } | null = { id: 'u1' };
  let userError: { message: string } | null = null;
  let connection: Record<string, unknown> | null = null;
  return {
    setUser: (u: typeof user, e: typeof userError = null) => { user = u; userError = e; },
    setConnection: (c: typeof connection) => { connection = c; },
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user }, error: userError }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: connection, error: null }),
          }),
        }),
      }),
    },
  };
});

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getUserClient: () => fake.client };
});

const { default: handler } = await import('./strava-status');

beforeEach(() => {
  fake.setUser({ id: 'u1' });
  fake.setConnection(null);
});

const req = (headers: Record<string, string> = {}) => new Request('http://x/api/strava-status', { headers });

describe('api/strava-status', () => {
  it('401s with connected:false when there is no Authorization header', async () => {
    const res = await handler(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ connected: false });
  });

  it('401s when the bearer token doesn\'t resolve to a user', async () => {
    fake.setUser(null, { message: 'invalid token' });
    const res = await handler(req({ Authorization: 'Bearer bad' }));
    expect(res.status).toBe(401);
  });

  it('connected:false with no connection row (not an error — just never connected)', async () => {
    const res = await handler(req({ Authorization: 'Bearer good' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: false });
  });

  it('reports connected:true with the athlete id and connected-at date, never the tokens', async () => {
    fake.setConnection({ athlete_id: 12345, created_at: '2030-01-01T00:00:00.000Z' });
    const res = await handler(req({ Authorization: 'Bearer good' }));
    const body = await res.json();
    expect(body).toEqual({ connected: true, athleteId: 12345, connectedAt: '2030-01-01T00:00:00.000Z' });
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/);
  });
});

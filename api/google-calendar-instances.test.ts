import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let connection: Record<string, unknown> | null = null;
  const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: connection, error: null }) };
  return {
    setConnection: (c: typeof connection) => { connection = c; },
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => ({ select: () => chain }),
    },
  };
});

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getUserClient: () => fake.client };
});

const gcal = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(() => Promise.resolve('access-token')),
  fetchGoogleEventInstances: vi.fn((_t: string, _c: string, eventId: string) => Promise.resolve([{ id: `${eventId}_1` }, { id: `${eventId}_2` }])),
}));
vi.mock('./_lib/googleCalendar', () => gcal);

const { default: handler } = await import('./google-calendar-instances');

const post = (body: unknown, auth = true) => new Request('http://x', {
  method: 'POST',
  headers: auth ? { Authorization: 'Bearer good', 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  fake.setConnection({ id: 'conn-1', calendars_enabled: ['primary'] });
});

describe('api/google-calendar-instances', () => {
  it('401s with no bearer token', async () => {
    expect((await handler(post({ connectionId: 'conn-1', calendarId: 'primary', eventIds: ['x'] }, false))).status).toBe(401);
  });

  it('400s on a malformed body or too many events', async () => {
    expect((await handler(post({ connectionId: 'conn-1', calendarId: 'primary' }))).status).toBe(400);
    expect((await handler(post({ connectionId: 'conn-1', calendarId: 'primary', eventIds: Array(51).fill('x') }))).status).toBe(400);
  });

  it('404s for a connection that is not the caller\'s, and refuses a calendar not switched on', async () => {
    fake.setConnection(null);
    expect((await handler(post({ connectionId: 'other', calendarId: 'primary', eventIds: ['x'] }))).status).toBe(404);
    fake.setConnection({ id: 'conn-1', calendars_enabled: [] });
    expect((await handler(post({ connectionId: 'conn-1', calendarId: 'primary', eventIds: ['x'] }))).status).toBe(400);
  });

  it('returns each event\'s single dates, tagged with the event', async () => {
    const res = await handler(post({ connectionId: 'conn-1', calendarId: 'primary', eventIds: ['a', 'b'] }));
    const { instances } = await res.json() as { instances: { eventId: string; event: { id: string } }[] };
    expect(instances.map((i) => [i.eventId, i.event.id])).toEqual([['a', 'a_1'], ['a', 'a_2'], ['b', 'b_1'], ['b', 'b_2']]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let connections: Record<string, unknown>[] = [];
  return {
    setConnections: (c: typeof connections) => { connections = c; },
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: connections, error: null }) }) }) }),
    },
  };
});

vi.mock('./_lib/supabaseEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/supabaseEdge')>();
  return { ...actual, getUserClient: () => fake.client };
});

interface FakeEvent { id: string; status?: string; summary?: string }
const gcal = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(() => Promise.resolve('access-token')),
  fetchGoogleCalendarList: vi.fn(() => Promise.resolve([{ id: 'primary', defaultReminders: [] as unknown[], accessRole: 'owner' }])),
  fetchGoogleCalendarEvents: vi.fn(() => Promise.resolve([] as FakeEvent[])),
}));
vi.mock('./_lib/googleCalendar', () => gcal);

const { default: handler } = await import('./google-calendar-sync');

const req = () => new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer good' } });

beforeEach(() => {
  fake.setConnections([{ id: 'conn-1', calendars_enabled: ['primary'] }]);
  gcal.getValidAccessToken.mockClear().mockResolvedValue('access-token');
  gcal.fetchGoogleCalendarList.mockClear().mockResolvedValue([{ id: 'primary', defaultReminders: [], accessRole: 'owner' }]);
  gcal.fetchGoogleCalendarEvents.mockClear().mockResolvedValue([]);
});

describe('api/google-calendar-sync', () => {
  it('401s with no bearer token', async () => {
    const res = await handler(new Request('http://x', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('405s on anything but POST', async () => {
    const res = await handler(new Request('http://x', { method: 'GET', headers: { Authorization: 'Bearer good' } }));
    expect(res.status).toBe(405);
  });

  it('returns no events, without erroring, when the account has no connections', async () => {
    fake.setConnections([]);
    const res = await handler(req());
    expect(await res.json()).toEqual({ events: [] });
  });

  it('skips a connection with no enabled calendars entirely (never calls the Google API for it)', async () => {
    fake.setConnections([{ id: 'conn-1', calendars_enabled: [] }]);
    await handler(req());
    expect(gcal.fetchGoogleCalendarList).not.toHaveBeenCalled();
  });

  it('passes deleted events (status cancelled) through, with the account and calendar details', async () => {
    fake.setConnections([{ id: 'conn-1', account_email: 'me@example.com', calendars_enabled: ['primary'] }]);
    gcal.fetchGoogleCalendarList.mockResolvedValue([{ id: 'primary', defaultReminders: [], accessRole: 'owner', backgroundColor: '#123456', timeZone: 'Australia/Sydney' } as never]);
    gcal.fetchGoogleCalendarEvents.mockResolvedValue([
      { id: 'e1', status: 'confirmed', summary: 'Keep me' },
      { id: 'e2', status: 'cancelled' },
    ]);
    const res = await handler(req());
    const { events } = await res.json() as { events: { account: string; calendar: { backgroundColor: string; timeZone: string }; event: { id: string } }[] };
    expect(events.map((e) => e.event.id)).toEqual(['e1', 'e2']);
    expect(events[0]).toMatchObject({ account: 'me@example.com', calendar: { backgroundColor: '#123456', timeZone: 'Australia/Sydney' } });
  });

  it('one connection failing (e.g. a revoked token) does not block the others', async () => {
    fake.setConnections([
      { id: 'bad-conn', calendars_enabled: ['primary'] },
      { id: 'good-conn', calendars_enabled: ['primary'] },
    ]);
    gcal.getValidAccessToken
      .mockRejectedValueOnce(new Error('token revoked'))
      .mockResolvedValueOnce('access-token');
    gcal.fetchGoogleCalendarEvents.mockResolvedValue([{ id: 'e1', status: 'confirmed', summary: 'From good conn' }]);

    const res = await handler(req());
    const { events } = await res.json() as { events: { connectionId: string; calendarId: string; event: { summary?: string } }[] };
    expect(events.some((e: { connectionId: string; calendarId: string }) => e.connectionId === 'bad-conn' && e.calendarId === '__error__')).toBe(true);
    expect(events.some((e: { connectionId: string; event: { summary?: string } }) => e.connectionId === 'good-conn' && e.event.summary === 'From good conn')).toBe(true);
  });
});

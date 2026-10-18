import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let connections: Record<string, unknown>[] = [];
  const chain = { eq: () => chain, then: (resolve: (v: unknown) => void) => resolve({ data: connections, error: null }) };
  return {
    setConnections: (c: typeof connections) => { connections = c; },
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

const ms = vi.hoisted(() => ({
  getValidMicrosoftAccessToken: vi.fn(() => Promise.resolve('tok')),
  fetchMicrosoftCalendars: vi.fn(() => Promise.resolve([{ id: 'cal-a', name: 'Calendar', hexColor: '#a4bdfc', canEdit: true }])),
  fetchCalendarDelta: vi.fn(),
}));
vi.mock('./_lib/microsoftCalendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/microsoftCalendar')>();
  return { ...actual, ...ms };
});

const { default: handler } = await import('./microsoft-calendar-sync');
const { DeltaExpiredError } = await import('./_lib/microsoftCalendar');

const post = (body: unknown) => new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify(body) });
type Out = { calendars: { changed: { id: string }[]; removed: string[]; seriesIds: string[]; cursor: { link: string; windowStart: string }; reset: boolean; account: string }[]; errors: unknown[] };

beforeEach(() => {
  fake.setConnections([{ id: 'ms-1', account_email: 'me@outlook.com', calendars_enabled: ['cal-a'] }]);
  ms.fetchCalendarDelta.mockReset();
});

describe('api/microsoft-calendar-sync', () => {
  it('401s with no bearer token, 405s on GET', async () => {
    expect((await handler(new Request('http://x', { method: 'POST' }))).status).toBe(401);
    expect((await handler(new Request('http://x', { method: 'GET', headers: { Authorization: 'Bearer good' } }))).status).toBe(405);
  });

  it('first sync: the whole window, single events passed on, changed series named, a new cursor', async () => {
    ms.fetchCalendarDelta.mockResolvedValue({
      changed: [
        { id: 'S1', type: 'singleInstance' },
        { id: 'O1', type: 'occurrence', seriesMasterId: 'M1' },
        { id: 'E1', type: 'exception', seriesMasterId: 'M1' },
      ],
      removed: ['R1'], deltaLink: 'link-1',
    });
    const out = await (await handler(post({}))).json() as Out;
    expect(ms.fetchCalendarDelta).toHaveBeenCalledWith('tok', 'cal-a', null, expect.anything());
    expect(out.calendars[0]).toMatchObject({ account: 'me@outlook.com', changed: [{ id: 'S1' }], removed: ['R1'], seriesIds: ['M1'], cursor: { link: 'link-1' }, reset: true });
  });

  it('next sync: carries on from the cursor and keeps its window', async () => {
    const windowStart = new Date(Date.now() - 31 * 86_400_000).toISOString();
    ms.fetchCalendarDelta.mockResolvedValue({ changed: [], removed: [], deltaLink: 'link-2' });
    const out = await (await handler(post({ cursors: { 'ms-1': { 'cal-a': { link: 'link-1', windowStart } } } }))).json() as Out;
    expect(ms.fetchCalendarDelta).toHaveBeenCalledTimes(1);
    expect(ms.fetchCalendarDelta).toHaveBeenCalledWith('tok', 'cal-a', 'link-1', expect.anything());
    expect(out.calendars[0]).toMatchObject({ cursor: { link: 'link-2', windowStart }, reset: false });
  });

  it('after a week: drains the old cursor, then starts again over the current window', async () => {
    const old = new Date(Date.now() - 38 * 86_400_000).toISOString();
    ms.fetchCalendarDelta
      .mockResolvedValueOnce({ changed: [], removed: ['GONE'], deltaLink: 'old-next' })
      .mockResolvedValueOnce({ changed: [{ id: 'S1', type: 'singleInstance' }], removed: [], deltaLink: 'fresh' });
    const out = await (await handler(post({ cursors: { 'ms-1': { 'cal-a': { link: 'link-1', windowStart: old } } } }))).json() as Out;
    expect(ms.fetchCalendarDelta.mock.calls.map((c) => c[2])).toEqual(['link-1', null]);
    expect(out.calendars[0]).toMatchObject({ removed: ['GONE'], changed: [{ id: 'S1' }], cursor: { link: 'fresh' } });
    expect(Date.parse(out.calendars[0].cursor.windowStart)).toBeGreaterThan(Date.parse(old));
  });

  it('an expired cursor starts again and says so', async () => {
    ms.fetchCalendarDelta
      .mockRejectedValueOnce(new DeltaExpiredError('gone'))
      .mockResolvedValueOnce({ changed: [], removed: [], deltaLink: 'fresh' });
    const out = await (await handler(post({ cursors: { 'ms-1': { 'cal-a': { link: 'dead', windowStart: new Date().toISOString() } } } }))).json() as Out;
    expect(out.calendars[0]).toMatchObject({ cursor: { link: 'fresh' }, reset: true });
  });

  it('one connection failing does not block the others', async () => {
    fake.setConnections([
      { id: 'bad', account_email: 'a@x.com', calendars_enabled: ['cal-a'] },
      { id: 'good', account_email: 'b@x.com', calendars_enabled: ['cal-a'] },
    ]);
    ms.getValidMicrosoftAccessToken.mockRejectedValueOnce(new Error('revoked'));
    ms.fetchCalendarDelta.mockResolvedValue({ changed: [], removed: [], deltaLink: 'l' });
    const out = await (await handler(post({}))).json() as Out;
    expect(out.errors).toEqual([{ connectionId: 'bad', error: 'revoked' }]);
    expect(out.calendars).toHaveLength(1);
  });
});

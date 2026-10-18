import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeltaExpiredError, fetchCalendarDelta, fetchSeries, graphFetch } from './microsoftCalendar';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const window = { start: '2026-10-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' };

describe('fetchCalendarDelta', () => {
  it('follows next links to the delta link, splitting changed from removed, asking for UTC text', async () => {
    const calls: { url: string; prefer: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, prefer: new Headers(init.headers).get('Prefer') });
      return url.includes('page2')
        ? json({ value: [{ id: 'b', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': 'https://graph/delta?token=next' })
        : json({ value: [{ id: 'a', type: 'singleInstance' }], '@odata.nextLink': 'https://graph/page2' });
    }));
    const r = await fetchCalendarDelta('tok', 'cal-a', null, window);
    expect(r).toEqual({ changed: [{ id: 'a', type: 'singleInstance' }], removed: ['b'], deltaLink: 'https://graph/delta?token=next' });
    expect(calls[0].url).toContain('/me/calendars/cal-a/calendarView/delta?startDateTime=');
    expect(calls[0].prefer).toContain('outlook.timezone="UTC"');
    expect(calls[0].prefer).toContain('outlook.body-content-type="text"');
  });

  it('a cursor Graph no longer knows (410) is DeltaExpiredError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: {} }, 410)));
    await expect(fetchCalendarDelta('tok', 'cal-a', 'https://graph/delta?token=old', window)).rejects.toBeInstanceOf(DeltaExpiredError);
  });
});

describe('graphFetch', () => {
  it('waits out a 429 for its Retry-After and tries again', async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '1' } }) : json({ ok: true }))));
    const p = graphFetch('https://graph/x', 'tok');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await p).status).toBe(200);
    expect(n).toBe(2);
  });
});

describe('fetchSeries', () => {
  it('returns the master and its dates, or null once the series is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/instances')
      ? json({ value: [{ id: 'o1', type: 'occurrence' }] })
      : json({ id: 'M1', type: 'seriesMaster' }))));
    expect(await fetchSeries('tok', 'M1', window)).toEqual({ master: { id: 'M1', type: 'seriesMaster' }, instances: [{ id: 'o1', type: 'occurrence' }] });
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 404)));
    expect(await fetchSeries('tok', 'M1', window)).toBeNull();
  });
});

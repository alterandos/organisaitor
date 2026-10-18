import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoogleCalendarEvents } from './googleCalendar';

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchGoogleCalendarEvents', () => {
  it('follows every page, asks for series (not single dates) and for deleted events', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      const page = new URL(url).searchParams.get('pageToken');
      const body = page === 'p2' ? { items: [{ id: 'c' }] } : { items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const events = await fetchGoogleCalendarEvents('tok', 'primary');
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(urls).toHaveLength(2);
    const params = new URL(urls[0]).searchParams;
    expect(params.get('singleEvents')).toBe('false');
    expect(params.get('showDeleted')).toBe('true');
  });

  it('fails rather than returning part of a calendar when a page fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (new URL(url).searchParams.get('pageToken')
      ? new Response('', { status: 500 })
      : new Response(JSON.stringify({ items: [{ id: 'a' }], nextPageToken: 'p2' }), { status: 200 }))));
    await expect(fetchGoogleCalendarEvents('tok', 'primary')).rejects.toThrow(/500/);
  });
});

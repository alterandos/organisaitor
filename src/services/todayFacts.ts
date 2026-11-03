import { useEffect, useState } from 'react';
import { log, errorMessage } from '@/utils/log';
import { readWikiFeed, type WikiToday } from '@/utils/todayFacts';

// Wikipedia's facts for the Today card (components/TodayCard; the rules are utils/todayFacts.ts):
// the featured feed for a day, fetched straight from Wikimedia (free, no key, open to the browser),
// as the Dictionary fetches from Wiktionary and the reading list from Open Library. Fetched once a
// day and kept on the device (`today-facts`, a cache: not user data, so not in
// PERSISTED_STORAGE_KEYS or backups), so the card shows offline once it has loaded that day.

const CACHE_KEY = 'today-facts';
let inFlight: { date: string; promise: Promise<WikiToday | null> } | null = null;

function cached(date: string): WikiToday | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c = raw ? JSON.parse(raw) as WikiToday : null;
    return c && c.date === date && Array.isArray(c.onThisDay) ? c : null;
  } catch { return null; }   // a broken copy is just fetched again
}

export function loadWikiToday(date: string): Promise<WikiToday | null> {
  const have = cached(date);
  if (have) return Promise.resolve(have);
  if (inFlight?.date === date) return inFlight.promise;
  const [y, m, d] = date.split('-');
  const promise = (async () => {
    try {
      const res = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${y}/${m}/${d}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const today = readWikiFeed(date, await res.json());
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(today)); } catch { /* a full device keeps it in memory only */ }
      return today;
    } catch (e) {
      log.warn('todayFacts', 'Wikipedia feed failed', errorMessage(e));
      return null;
    } finally {
      inFlight = null;
    }
  })();
  inFlight = { date, promise };
  return promise;
}

// For the card: the day's facts once loaded (undefined while loading, null when they couldn't be).
export function useWikiToday(date: string, active: boolean): WikiToday | null | undefined {
  const [state, setState] = useState<{ date: string; value: WikiToday | null } | null>(() => {
    const c = cached(date);
    return c ? { date, value: c } : null;
  });
  useEffect(() => {
    if (!active) return;
    let live = true;
    void loadWikiToday(date).then((value) => { if (live) setState({ date, value }); });
    return () => { live = false; };
  }, [date, active]);
  return state?.date === date ? state.value : undefined;
}

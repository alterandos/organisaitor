// The Today card's rules (components/TodayCard, 2026-11-02), pure: reading Wikipedia's featured feed
// for a day, choosing what to show, and finding the person's notes from this day in other years.

export interface WikiFact { title: string; text: string; url: string | null }
export interface WikiEvent { year: number; text: string; url: string | null; title: string | null }
export interface WikiToday { date: string; featured: WikiFact | null; onThisDay: WikiEvent[] }

const MAX_EVENTS = 12;

type Page = { titles?: { normalized?: unknown }; extract?: unknown; content_urls?: { desktop?: { page?: unknown } } };
const pageUrl = (p: Page | undefined) => (typeof p?.content_urls?.desktop?.page === 'string' ? p.content_urls.desktop.page : null);

// Wikimedia's `feed/v1/wikipedia/en/featured/YYYY/MM/DD` answer, trimmed to what the card shows:
// today's featured article and the day's selected events. Anything odd is dropped.
export function readWikiFeed(date: string, json: unknown): WikiToday {
  const data = (json ?? {}) as { tfa?: Page; onthisday?: { text?: unknown; year?: unknown; pages?: Page[] }[] };
  const tfa = data.tfa;
  const featured = tfa && typeof tfa.extract === 'string' && tfa.extract.trim() && typeof tfa.titles?.normalized === 'string'
    ? { title: tfa.titles.normalized, text: tfa.extract.trim(), url: pageUrl(tfa) } : null;
  const onThisDay = (Array.isArray(data.onthisday) ? data.onthisday : [])
    .filter((e) => typeof e.text === 'string' && e.text.trim() && typeof e.year === 'number')
    .slice(0, MAX_EVENTS)
    .map((e) => ({ year: e.year as number, text: (e.text as string).trim(), url: pageUrl(e.pages?.[0]), title: typeof e.pages?.[0]?.titles?.normalized === 'string' ? e.pages[0].titles.normalized : null }));
  return { date, featured, onThisDay };
}

// A full stop after a title or an initial (St., Dr., J.) doesn't end a sentence.
const NOT_AN_END = /(?:^|\s)(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Gen|Col|Lt|Capt|Rev|No|Co|Inc|Ltd|vs|c|ca)\.$/;

// The first `n` sentences of a text (an article's opening, as the fact).
export function firstSentences(text: string, n = 2): string {
  const pieces = text.trim().split(/(?<=[.!?])\s+(?=[A-Z"“‘(])/);
  const sentences: string[] = [];
  for (const piece of pieces) {
    const last = sentences[sentences.length - 1];
    if (last && NOT_AN_END.test(last)) sentences[sentences.length - 1] = `${last} ${piece}`;
    else sentences.push(piece);
  }
  return sentences.slice(0, n).join(' ');
}

// Which of `count` things to show on `date`, moved on by `step` ("Another"): the same all day.
export function pickForDay(count: number, date: string, step = 0): number {
  if (count <= 0) return -1;
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h + step) % count;
}

// The day (YYYY-MM-DD, local time) an ISO moment falls on.
function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface NoteOnThisDay { id: string; years: number }

// Notes made on this day (month and day) in an earlier year, the most recent year first; archived
// and untitled ones are left out.
export function notesOnThisDay(
  notes: readonly { id: string; title: string; createdAt: string; archivedAt: string | null }[], date: string,
): NoteOnThisDay[] {
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(4, 10);
  return notes
    .map((n) => ({ n, day: localDay(n.createdAt) }))
    .filter(({ n, day }) => !n.archivedAt && n.title.trim() && day.slice(4, 10) === monthDay && Number(day.slice(0, 4)) < year)
    .map(({ n, day }) => ({ id: n.id, years: year - Number(day.slice(0, 4)), at: n.createdAt }))
    .sort((a, b) => a.years - b.years || b.at.localeCompare(a.at))
    .map(({ id, years }) => ({ id, years }));
}

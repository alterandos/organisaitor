import { extractKeywords, stemForMatch } from '@/utils/keywords';

// THE ordering for every "link a …" picker (tasks, lists, …): the same approach NotePickerModal
// introduced, shared so every picker in the suite behaves alike (a pattern — see CLAUDE.md
// "Pickers suggest by keywords"). NotePickerModal keeps its own tab-aware variant of the same
// scoring, because it also chooses the best-matching tab.
//
// - Empty search box → suggestions: the linking item's title (`suggestFrom`) is reduced to keywords
//   (stop-words dropped, crude stemming), each is looked for in every candidate's fields, and a
//   keyword counts for more the rarer it is across the candidates (idf). Candidates with no hit
//   follow, most recent first.
// - Typed search → every word must appear in some field; ranked by the weights of the fields hit.
// Ties go to the more recent candidate.

export interface RankField {
  text:     string;
  weight:   number;    // e.g. title 3, a container's name 2, body text 1
  counted?: boolean;   // long text: score by (log-scaled, capped) hit count rather than presence
}

interface Prepared<T> { item: T; fields: { lower: string; weight: number; counted: boolean }[]; recency: number }

function prepare<T>(items: T[], fieldsOf: (t: T) => RankField[], recencyOf: (t: T) => number): Prepared<T>[] {
  return items.map((item) => ({
    item,
    fields: fieldsOf(item).map((f) => ({ lower: f.text.toLowerCase(), weight: f.weight, counted: !!f.counted })),
    recency: recencyOf(item),
  }));
}

function termScore(p: Prepared<unknown>, term: string, useCounts: boolean): number {
  let score = 0;
  for (const f of p.fields) {
    if (!f.lower.includes(term)) continue;
    if (useCounts && f.counted) {
      let count = 0;
      for (let at = f.lower.indexOf(term); at !== -1 && count < 50; at = f.lower.indexOf(term, at + term.length)) count++;
      score += f.weight * Math.min(1 + Math.log(count), 3);
    } else {
      score += f.weight;
    }
  }
  return score;
}

const byRecency = <T>(a: Prepared<T>, b: Prepared<T>) => b.recency - a.recency;

// The picker's list when nothing is typed: keyword suggestions first, then everything else by recency.
export function rankSuggestions<T>(
  items: T[], fieldsOf: (t: T) => RankField[], recencyOf: (t: T) => number, suggestFrom: string | null | undefined,
): { items: T[]; suggested: number; keywords: string[] } {
  const all = prepare(items, fieldsOf, recencyOf);
  const keywords = extractKeywords(suggestFrom);
  const stems = keywords.map(stemForMatch);
  if (stems.length === 0) return { items: all.sort(byRecency).map((p) => p.item), suggested: 0, keywords };
  const perTerm = all.map((p) => stems.map((s) => termScore(p, s, true)));
  const idf = stems.map((_, k) => Math.log(1 + all.length / (1 + perTerm.filter((row) => row[k] > 0).length)));
  const scored = all.map((p, i) => ({ p, score: perTerm[i].reduce((sum, v, k) => sum + v * idf[k], 0) }));
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || byRecency(a.p, b.p)).map((s) => s.p);
  const taken = new Set(hits);
  const rest = all.filter((p) => !taken.has(p)).sort(byRecency);
  return { items: [...hits, ...rest].map((p) => p.item), suggested: hits.length, keywords };
}

// The picker's list while typing: candidates matching every word, best field hits first.
export function rankSearch<T>(items: T[], fieldsOf: (t: T) => RankField[], recencyOf: (t: T) => number, query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = prepare(items, fieldsOf, recencyOf);
  if (terms.length === 0) return all.sort(byRecency).map((p) => p.item);
  const scored: { p: Prepared<T>; score: number }[] = [];
  for (const p of all) {
    const per = terms.map((t) => termScore(p, t, false));
    if (per.some((v) => v === 0)) continue;
    scored.push({ p, score: per.reduce((a, b) => a + b, 0) });
  }
  return scored.sort((a, b) => b.score - a.score || byRecency(a.p, b.p)).map((s) => s.p.item);
}

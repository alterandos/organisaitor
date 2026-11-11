import { LABELS } from '@/config/labels';
import { rankSearch, rankSuggestions, type RankField } from '@/utils/suggestRank';
import type { PickerSection } from './ItemPickerModal';

// The order every picker uses ("Pickers suggest by keywords", utils/suggestRank.ts): with the
// search box empty, suggestions from the item being linked from, under "Suggested from …", then
// the rest under "Recent"; typed, every word must match.
export function rankPicker<T>(
  candidates: T[], fieldsOf: (t: T) => RankField[], orderOf: (t: T) => number, query: string, suggestFrom: string | undefined,
): { rows: T[]; sections: PickerSection[] } {
  if (query.trim()) return { rows: rankSearch(candidates, fieldsOf, orderOf, query), sections: [] };
  const r = rankSuggestions(candidates, fieldsOf, orderOf, suggestFrom);
  const sections: PickerSection[] = r.suggested > 0 ? [{ at: 0, label: LABELS.pickers.suggestedFrom(r.keywords) }] : [];
  if (r.suggested > 0 && r.suggested < r.items.length) sections.push({ at: r.suggested, label: LABELS.pickers.recent });
  return { rows: r.items, sections };
}

import type { EndeavourPeriod, FieldSchema } from '@/types';
import { LABELS } from '@/config/labels';
import { rangeOf } from '@/utils/datePeriods';

// What stops an Endeavour from being made, keyed by the field it's about, so the form can show each
// note in red under that field (CLAUDE.md "A form says what's missing, under the field"). Keys:
// `name`, `field-<id>` (a detail of its own), `period-<id>` (a named period: no name, or it ends
// before it starts), `dates` / `break-<i>` (an old single period, still checked where one is edited).

const L = LABELS.endeavourCreator;

export function planErrors(name: string, fields: FieldSchema[], period: EndeavourPeriod | null, values?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const blank = (s: string) => !s.trim();
  if (blank(name)) out.name = L.nameNeeded;
  for (const f of fields) {
    if (f.type === 'dateRange') {
      const r = rangeOf(values?.[f.id]);
      if (blank(f.name)) out[`period-${f.id}`] = LABELS.periods.nameNeeded;
      else if (r.from && r.to && r.to < r.from) out[`period-${f.id}`] = LABELS.period.endBeforeStart;
    } else if (blank(f.name)) out[`field-${f.id}`] = L.detailNeeded;
  }
  if (period?.start && period.end && period.end < period.start) out.dates = LABELS.period.endBeforeStart;
  (period?.breaks ?? []).forEach((b, i) => {
    if (blank(b.label)) out[`break-${i}`] = LABELS.period.breakNeeded;
    else if (!b.from) out[`break-${i}`] = LABELS.period.breakDates;
    else if (b.to && b.to < b.from) out[`break-${i}`] = LABELS.period.endBeforeStart;
  });
  return out;
}

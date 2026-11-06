import type { EndeavourPeriod, FieldSchema } from '@/types';
import { LABELS } from '@/config/labels';

// What stops an Endeavour from being made, keyed by the field it's about, so the form can show each
// note in red under that field (CLAUDE.md "A form says what's missing, under the field"). Keys:
// `name`, `field-<i>` (a detail of its own), `break-<i>` (a piece of time off).

const L = LABELS.endeavourCreator;

export function planErrors(name: string, fields: FieldSchema[], period: EndeavourPeriod | null): Record<string, string> {
  const out: Record<string, string> = {};
  const blank = (s: string) => !s.trim();
  if (blank(name)) out.name = L.nameNeeded;
  fields.forEach((f, i) => { if (blank(f.name)) out[`field-${i}`] = L.detailNeeded; });
  (period?.breaks ?? []).forEach((b, i) => {
    if (blank(b.label)) out[`break-${i}`] = LABELS.period.breakNeeded;
    else if (!b.from) out[`break-${i}`] = LABELS.period.breakDates;
  });
  return out;
}

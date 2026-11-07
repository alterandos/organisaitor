import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { isHydrating, onLoaded } from '@/services/sync/hydrating';
import { periodToNamed } from '@/utils/datePeriods';
import { LABELS } from '@/config/labels';
import type { Collection, CollectionId } from '@/types';

// An Endeavour's single period (dates, breaks, an exam period) becomes named periods (2026-11-07,
// utils/datePeriods.ts): its dates a period it runs during, each break one it pauses during, its exam
// period one of its own to choose. One watcher, so whatever still writes a period (the agent's
// semester, a subject's dates read from an outline, another device on an older build) is converted
// as it's written. Nothing is lost: what it runs during resolves to the same dates and breaks.

const L = LABELS.periods;
let converting = false;

function convertOne(c: Collection): void {
  if (!c.period) return;
  const named = periodToNamed(c.period, { dates: c.templateId === 'semester' ? L.teaching : L.dates, exams: L.exams, timeOff: L.timeOff }, () => nanoid(8));
  const a = c.attributes ?? { typeId: null, fields: [], values: {} };
  // A period field (the attributes pane's old one) goes with it.
  const fields = [...a.fields.filter((f) => f.type !== 'period'), ...named.fields];
  const keep = c.dateUse && (c.dateUse.runs.length || c.dateUse.pauses.length);
  useTaskStore.getState().updateCollection(c.id as CollectionId, {
    attributes: { typeId: a.typeId, fields, values: { ...a.values, ...named.values } },
    ...(keep ? {} : { dateUse: named.use }),
    period: null,
  });
}

export function convertPeriods(): number {
  if (converting) return 0;
  converting = true;
  try {
    const old = Object.values(useTaskStore.getState().collections).filter((c) => !!c.period);
    for (const c of old) convertOne(c);
    return old.length;
  } finally {
    converting = false;
  }
}

export function initPeriodConversion(): () => void {
  convertPeriods();
  const offLoaded = onLoaded(() => { convertPeriods(); });
  const off = useTaskStore.subscribe((s, p) => {
    if (s.collections !== p.collections && !isHydrating() && Object.values(s.collections).some((c) => c.period)) convertPeriods();
  });
  return () => { offLoaded(); off(); };
}

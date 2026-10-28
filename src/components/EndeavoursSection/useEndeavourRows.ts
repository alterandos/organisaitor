import { useMemo } from 'react';
import { useOverviewSnapshot } from '@/overview/useOverviewSnapshot';
import { runOverview, DEFAULT_QUERY } from '@/overview/engine';
import { useSettingsStore } from '@/store/settingsStore';
import { todayIsoInZone, resolveTimezone } from '@/utils/timezone';
import type { OverviewQuery, OverviewRow } from '@/types/overview';

// Every app's items as Overview rows (done ones too, never archived), worked out once for the whole
// section; a home or a row on the page takes its Endeavour's share (utils/endeavourSummary.ts).
const ALL: OverviewQuery = { ...DEFAULT_QUERY, collectionId: null, status: 'all', when: 'any', windowDays: null, sources: [] };

export function useEndeavourRows(): { rows: OverviewRow[]; today: string } {
  const snapshot = useOverviewSnapshot();
  const timezone = useSettingsStore((s) => s.timezone);
  const today = todayIsoInZone(resolveTimezone(timezone));
  const rows = useMemo(() => runOverview(ALL, snapshot, today).groups.flatMap((g) => g.rows), [snapshot, today]);
  return { rows, today };
}

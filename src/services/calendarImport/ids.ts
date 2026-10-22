import type { CalendarEventId } from '@/types';
import { stableId } from '@/utils/stableId';

// The id an event imported from a synced calendar gets: the same on every device (utils/stableId.ts,
// where this exception to "never a fixed id" is explained; approved by the user 2026-10-18).
export function importedEventId(userId: string, key: string): CalendarEventId {
  return stableId('imp', userId, key) as CalendarEventId;
}

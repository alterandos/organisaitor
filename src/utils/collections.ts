import type { Collection } from '@/types';

// Order the Endeavour-focus picker (CollectionFilterPicker) renders in: Projects group
// then Lists group. Archived Endeavours are excluded (sunset, not offered for focus).
// Shared with the Ctrl+E digit-select hotkey so the number a user presses always
// matches the position they see on screen.
export function getOrderedEndeavours(collectionsRecord: Record<string, Collection>): Collection[] {
  const all = Object.values(collectionsRecord).filter((c) => !c.archivedAt);
  return [...all.filter((c) => c.kind === 'project'), ...all.filter((c) => c.kind === 'list')];
}

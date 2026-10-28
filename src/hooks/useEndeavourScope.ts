import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { endeavourSubtree } from '@/utils/endeavourGraph';

// The Endeavour filter's scope: the chosen Endeavour and everything part of it, or null when none is
// chosen. Test an item with `inEndeavourScope(scope, item.collectionId)` (utils/endeavourGraph.ts),
// never by comparing ids, so choosing a parent includes its parts (pattern test).
export function useEndeavourScope(collectionId: string | null | undefined): ReadonlySet<string> | null {
  const collections = useTaskStore((s) => s.collections);
  return useMemo(() => (collectionId ? endeavourSubtree(collectionId, collections) : null), [collectionId, collections]);
}

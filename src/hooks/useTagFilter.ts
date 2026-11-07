import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { tagTest, type TagTest } from '@/utils/tagScope';

// The header's tag filter (components/TagFilterPicker) as a test, or null when no tag is chosen.
// Each section asks it of every item (`test({ tagIds, collectionId, notebookIds })`), so a tag
// passed down from an Endeavour or notebook counts (utils/tagScope.ts).
export function useTagFilter(): TagTest | null {
  const active = useUIStore((s) => s.activeTagIds);
  const collections = useTaskStore((s) => s.collections);
  const noteTags = useNoteStore((s) => s.noteTags);
  return useMemo(() => tagTest(active, collections, noteTags), [active, collections, noteTags]);
}

import { useNoteStore } from '@/store/noteStore';
import { isHydrating, onLoaded } from '@/services/sync/hydrating';
import { annotationTags } from '@/utils/notes';
import type { NoteTagId } from '@/types/notes';

// Annotation labels made as a kind of Important took its star (the user, 2026-11-07: a label
// shouldn't look like Important). Any still holding it is given none, so it shows the annotation
// icon (ANNOTATION_ICON). Run at startup and after each sync load; nothing to do once done.
const STAR = '⭐';

export function clearAnnotationStars(): number {
  const tags = annotationTags(useNoteStore.getState().noteTags).filter((t) => t.icon === STAR);
  for (const t of tags) useNoteStore.getState().updateNoteTag(t.id as NoteTagId, { icon: null, tagTypeId: null });
  return tags.length;
}

export function initAnnotationIcons(): () => void {
  if (!isHydrating()) clearAnnotationStars();
  return onLoaded(() => { clearAnnotationStars(); });
}

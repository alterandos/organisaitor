import { commitTags } from '@/services/tags';
import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import type { NoteTagId } from '@/types/notes';
import styles from './AddNoteTagModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CreateKindSwitcher } from '@/components/CreateKindSwitcher/CreateKindSwitcher';
import { CloseIcon } from '@/components/Icons';
import { NoteTagFields, type NoteTagDraft } from '@/components/NoteTagFields/NoteTagFields';

function getDepth(tagId: string | null, noteTags: Record<string, { parentTagId: string | null }>): number {
  if (!tagId) return 0;
  let depth = 1;
  let current = noteTags[tagId];
  while (current?.parentTagId) {
    depth++;
    current = noteTags[current.parentTagId];
  }
  return depth;
}

const LEVEL_LABELS = ['Notebook', 'Page', 'Sub-page', 'Section'];

// A new notebook or annotation label: the same fields as its edit form (components/NoteTagFields,
// "Creating and editing a thing is one form").
export function AddNoteTagModal() {
  const closeModal             = useUIStore((s) => s.closeModal);
  const pendingNoteTagParentId = useUIStore((s) => s.pendingNoteTagParentId);
  const pendingNoteTagKind     = useUIStore((s) => s.pendingNoteTagKind);
  const noteTags               = useNoteStore((s) => s.noteTags);
  const addNoteTag             = useNoteStore((s) => s.addNoteTag);

  const isTag = pendingNoteTagKind === 'tag';
  const [draft, setDraft] = useState<NoteTagDraft>(() => ({
    name: useUIStore.getState().createDraft ?? '', icon: '', color: null, parentId: pendingNoteTagParentId,
    collectionId: null, suiteTagIds: [], fieldSchema: [],
  }));
  // undefined = follow the parent notebook's Endeavour (also after the parent changes), or, for a
  // top-level notebook, the Endeavour chosen where it's being made (an Endeavour's home, a filter);
  // anything else is the user's own pick.
  const [pickedCollection, setPickedCollection] = useState<CollectionId | null | undefined>(undefined);
  const [activeAtOpen] = useState(() => selectActiveCollectionId(useUIStore.getState()) as CollectionId | null);
  const parentTag = draft.parentId ? noteTags[draft.parentId] : null;
  const collectionId = pickedCollection !== undefined ? pickedCollection : parentTag ? (parentTag.collectionId ?? null) : activeAtOpen;
  const levelLabel = isTag ? LABELS.annotations.one : LEVEL_LABELS[Math.min(getDepth(draft.parentId, noteTags), LEVEL_LABELS.length - 1)];

  useEscapeClose(() => { closeModal(); });

  function handleCreate() {
    if (!draft.name.trim()) return;
    const id = addNoteTag({
      name: draft.name.trim(),
      kind: pendingNoteTagKind,
      icon: draft.icon.trim() || null,
      color: draft.color,
      parentTagId: isTag ? null : draft.parentId,
      tagTypeId: null,
      collectionId: isTag ? null : collectionId,
    });
    const tagIds = isTag ? [] : commitTags(draft.suiteTagIds);
    useNoteStore.getState().updateNoteTag(id as NoteTagId, { ...(tagIds.length ? { suiteTagIds: tagIds } : {}), ...(isTag && draft.fieldSchema.length ? { fieldSchema: draft.fieldSchema } : {}) });
    closeModal();
  }

  useCtrlEnterSubmit(() => handleCreate());

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <CreateKindSwitcher current={isTag ? 'note-tag' : 'notebook'} draft={draft.name} />
        <div className={styles.header}>
          <h2>{LABELS.noteTagFields.newTitle(levelLabel)}</h2>
          <button className={styles.closeBtn} onClick={closeModal} aria-label={LABELS.noteTagFields.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <NoteTagFields kind={pendingNoteTagKind} levelLabel={levelLabel} onEnter={handleCreate}
            value={{ ...draft, collectionId }}
            onChange={(patch) => {
              if ('collectionId' in patch) setPickedCollection(patch.collectionId ?? null);
              setDraft((d) => ({ ...d, ...patch }));
            }} />
        </div>
        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeModal}>{LABELS.noteTagFields.cancel}</button>
          <button className={styles.btnPrimary} onClick={handleCreate} disabled={!draft.name.trim()}>{LABELS.noteTagFields.create}</button>
        </div>
      </div>
    </div>
  );
}

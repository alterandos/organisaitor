import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { NOTE_TEMPLATES } from '@/config/noteTemplates';
import { LABELS } from '@/config/labels';
import { resolveNoteInheritedCollectionId } from '@/utils/notes';
import type { NoteTagId, CollectionId } from '@/types';
import styles from './AddNoteModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';

export function AddNoteModal() {
  const closeModal        = useUIStore((s) => s.closeModal);
  const openNote          = useUIStore((s) => s.openNote);
  const selectedNoteTagId = useUIStore((s) => s.selectedNoteTagId);

  const addNote       = useNoteStore((s) => s.addNote);
  const getRootTags   = useNoteStore((s) => s.getRootTags);
  const getChildTags  = useNoteStore((s) => s.getChildTags);
  const noteTags      = useNoteStore((s) => s.noteTags);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const allCollections = Object.values(collectionsRecord);

  const [title, setTitle]             = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<NoteTagId[]>(() => selectedNoteTagId ? [selectedNoteTagId] : []);
  const [showTagPicker, setShowTagPicker]   = useState(false);
  const [tagPickerPath, setTagPickerPath]   = useState<NoteTagId[]>([]);
  const [templateId, setTemplateId]         = useState(NOTE_TEMPLATES[0].id);
  // undefined = follow the selected notebook(s)' Endeavour; anything else is the user's explicit pick
  const [pickedCollectionId, setPickedCollectionId] = useState<CollectionId | null | undefined>(undefined);
  const collectionId = pickedCollectionId !== undefined
    ? pickedCollectionId
    : resolveNoteInheritedCollectionId(selectedTagIds, noteTags);

  useEscapeClose(() => { closeModal(); });
  useCtrlEnterSubmit(() => handleSave());

  function handleSave(openEditor = false) {
    if (!title.trim()) return;
    const template = NOTE_TEMPLATES.find((t) => t.id === templateId);
    const noteId = addNote({
      title,
      content: template?.content ? JSON.stringify(template.content) : '',
      tagIds: selectedTagIds,
      templateId,
      collectionId,
    });
    if (openEditor) {
      closeModal();
      openNote(noteId);
    } else {
      setTitle('');
      setSelectedTagIds([]);
      setTemplateId(NOTE_TEMPLATES[0].id);
      setPickedCollectionId(undefined);
      closeModal();
    }
  }

  const handleTagSelect = (tagId: NoteTagId) => {
    const children = getChildTags(tagId);
    if (children.length > 0) {
      setTagPickerPath([...tagPickerPath, tagId]);
    } else {
      if (selectedTagIds.includes(tagId)) {
        setSelectedTagIds(selectedTagIds.filter((t) => t !== tagId));
      } else {
        setSelectedTagIds([...selectedTagIds, tagId]);
      }
      setTagPickerPath([]);
    }
  };

  const handleBackTag = () => {
    setTagPickerPath(tagPickerPath.slice(0, -1));
  };

  const currentTagLevel = tagPickerPath.length > 0
    ? tagPickerPath[tagPickerPath.length - 1]
    : null;

  const tagsToShow = currentTagLevel
    ? getChildTags(currentTagLevel)
    : getRootTags();

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Add Note</h2>
          <button className={styles.closeBtn} onClick={closeModal}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label htmlFor="title" className={styles.label}>Title</label>
            <input
              id="title"
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave(false);
              }}
              placeholder="Note title..."
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Template</label>
            <div className={styles.templateGrid}>
              {NOTE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.templateOption} ${templateId === t.id ? styles.templateOptionSelected : ''}`}
                  onClick={() => setTemplateId(t.id)}
                  title={t.description}
                >
                  <span className={styles.templateIcon}>{t.icon}</span>
                  <span className={styles.templateName}>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Tags</label>
            <button
              className={styles.tagPickerBtn}
              onClick={() => setShowTagPicker(!showTagPicker)}
            >
              {selectedTagIds.length > 0
                ? `${selectedTagIds.length} tag(s) selected`
                : 'Select tags...'}
            </button>

            {showTagPicker && (
              <div className={styles.tagPicker}>
                {tagPickerPath.length > 0 && (
                  <button className={styles.tagPickerBack} onClick={handleBackTag}>
                    ← Back
                  </button>
                )}
                <div className={styles.tagPickerList}>
                  {tagsToShow.map((tag) => (
                    <button
                      key={tag.id}
                      className={`${styles.tagPickerItem} ${
                        selectedTagIds.includes(tag.id as NoteTagId) ? styles.tagPickerItemSelected : ''
                      }`}
                      onClick={() => handleTagSelect(tag.id as NoteTagId)}
                    >
                      <span className={styles.tagPickerIcon}>{tag.icon ?? '📁'}</span>
                      <span>{tag.name}</span>
                      {selectedTagIds.includes(tag.id as NoteTagId) && (
                        <span className={styles.checkmark}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {allCollections.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>{LABELS.collection}</label>
              <CollectionPicker
                collections={allCollections}
                value={collectionId}
                onChange={setPickedCollectionId}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={closeModal}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => handleSave(false)}
            disabled={!title.trim()}
          >
            Save & Close
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => handleSave(true)}
            disabled={!title.trim()}
          >
            Save & Edit
          </button>
        </div>
      </div>
    </div>
  );
}

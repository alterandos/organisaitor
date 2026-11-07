import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { TagField } from '@/components/TagField/TagField';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { annotationTags, takesNotes } from '@/utils/notes';
import { sourceName, tagsForNote } from '@/utils/tagScope';
import { LABELS } from '@/config/labels';
import { ANNOTATION_ICON } from '@/config/itemIcons';
import type { CollectionId } from '@/types';
import type { NoteTag } from '@/types/notes';
import styles from './NoteFields.module.css';

// THE details of a note, for a new one and an existing one alike (adopted 2026-11-07, "Creating and
// editing a thing is one form": a new note couldn't be given annotations, a colour or a pin, and
// chose its notebooks another way). AddNoteModal adds its title and template (a note's title is
// edited in the note itself); EditNoteMetaModal adds what needs a saved note (its backdrop, dates).

const L = LABELS.noteFields;

export interface NoteDraft {
  // Its notebooks and annotation labels (a note's `tagIds` hold both).
  tagIds:       string[];
  // null = follow its notebooks' Endeavour.
  collectionId: CollectionId | null;
  suiteTagIds:  string[];
  color:        string | null;
  pinned:       boolean;
}

function notebookTree(noteTags: Record<string, NoteTag>, parentId: string | null = null, depth = 0): { tag: NoteTag; depth: number }[] {
  return Object.values(noteTags)
    .filter((t) => t.kind === 'area' && t.parentTagId === parentId)
    .sort((a, b) => a.order - b.order)
    .flatMap((t) => [{ tag: t, depth }, ...notebookTree(noteTags, t.id, depth + 1)]);
}

export function NoteFields({ value, onChange, inheritedCollectionId }: {
  value: NoteDraft; onChange: (patch: Partial<NoteDraft>) => void;
  // The Endeavour its notebooks give it, shown while it has none of its own.
  inheritedCollectionId: CollectionId | null;
}) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const collections = useTaskStore((s) => s.collections);
  const allCollections = Object.values(collections);
  // Stickies and the Scratchpad take no notes: not offered.
  const notebooks = notebookTree(noteTags).filter((i) => takesNotes(i.tag));
  const labels = annotationTags(noteTags).sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (id: string) => onChange({ tagIds: value.tagIds.includes(id) ? value.tagIds.filter((x) => x !== id) : [...value.tagIds, id] });
  const row = (tag: NoteTag, depth: number, fallback: string) => (
    <label key={tag.id} className={styles.tagRow} style={{ paddingLeft: `${0.5 + depth}rem` }}>
      <input type="checkbox" className={styles.checkbox} checked={value.tagIds.includes(tag.id)} onChange={() => toggle(tag.id)} />
      <span className={styles.tagIcon}><ItemIcon icon={tag.icon} fallback={fallback} /></span>
      <span className={styles.tagName} style={tag.color ? { color: tag.color } : undefined}>{tag.name}</span>
    </label>
  );
  const collectionId = value.collectionId ?? inheritedCollectionId;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionLabel}>{LABELS.noteForm.notebooks}</div>
        {notebooks.length === 0 ? <div className={styles.emptyHint}>{L.noNotebooks}</div>
          : <div className={styles.tagList}>{notebooks.map(({ tag, depth }) => row(tag, depth, '📁'))}</div>}
      </section>

      {allCollections.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>{LABELS.collection}</div>
          <CollectionPicker collections={allCollections} value={collectionId} onChange={(id) => onChange({ collectionId: id })} noneLabel={`No ${LABELS.collection}`} />
        </section>
      )}

      <section className={styles.section}>
        <TagField value={value.suiteTagIds} onChange={(suiteTagIds) => onChange({ suiteTagIds })} labelClassName={styles.sectionLabel}
          inherited={tagsForNote(value.tagIds, collectionId, noteTags, collections)}
          fromName={(id) => sourceName(id, noteTags, collections)} />
      </section>

      {labels.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>{LABELS.annotations.plural}</div>
          <div className={styles.tagList}>{labels.map((tag) => row(tag, 0, ANNOTATION_ICON))}</div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{L.colour}</div>
        <ColorPicker palette="standard" value={value.color} onChange={(color) => onChange({ color })} />
      </section>

      <section className={styles.section}>
        <label className={styles.pinnedRow}>
          <input type="checkbox" className={styles.checkbox} checked={value.pinned} onChange={(e) => onChange({ pinned: e.target.checked })} />
          <span>{LABELS.quickAccess.pin}</span>
        </label>
      </section>
    </>
  );
}

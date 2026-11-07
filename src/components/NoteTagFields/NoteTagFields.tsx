import { useState } from 'react';
import { nanoid } from 'nanoid';
import { TagField } from '@/components/TagField/TagField';
import { IconField } from '@/components/IconPicker/IconField';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { useNoteStore } from '@/store/noteStore';
import { useTaskStore } from '@/store/taskStore';
import { sourceName, tagsFromNotebookPlace } from '@/utils/tagScope';
import { LABELS } from '@/config/labels';
import { ANNOTATION_ICON } from '@/config/itemIcons';
import type { CollectionId } from '@/types';
import type { NoteTag, NoteTagFieldDef, NoteTagFieldType, NoteTagId } from '@/types/notes';
import styles from './NoteTagFields.module.css';

// THE fields of a notebook or an annotation label, new or edited (adopted 2026-11-07, "Creating and
// editing a thing is one form": only the new form could say where a notebook goes, only the edit
// form had an annotation's attributes, and the two colour pickers differed). AddNoteTagModal and
// EditNoteTagModal hold the values and save them; what applies at once to a saved notebook (keep it
// encrypted, its backdrop) stays in the edit form.

const L = LABELS.noteTagFields;

export interface NoteTagDraft {
  name:         string;
  icon:         string;
  color:        string | null;
  parentId:     NoteTagId | null;
  collectionId: CollectionId | null;
  suiteTagIds:  string[];
  fieldSchema:  NoteTagFieldDef[];
}

const FIELD_TYPES: NoteTagFieldType[] = ['text', 'url', 'date', 'number', 'rating', 'boolean', 'select'];

// Every notebook in tree order with its depth, leaving out `except` and what's inside it (a
// notebook can't go inside itself).
function flattenNotebooks(noteTags: Record<string, NoteTag>, except: string | null, parentId: string | null = null, depth = 0): { tag: NoteTag; depth: number }[] {
  return Object.values(noteTags)
    .filter((t) => t.kind === 'area' && t.parentTagId === parentId && t.id !== except)
    .sort((a, b) => a.order - b.order)
    .flatMap((t) => [{ tag: t, depth }, ...flattenNotebooks(noteTags, except, t.id, depth + 1)]);
}

// "University › Biology": where it sits.
function notebookPath(id: string, noteTags: Record<string, NoteTag>): string {
  const names: string[] = [];
  for (let t: NoteTag | undefined = noteTags[id]; t; t = t.parentTagId ? noteTags[t.parentTagId] : undefined) names.unshift(t.name);
  return names.join(' › ');
}

export function NoteTagFields({ kind, value, onChange, onEnter, selfId = null, levelLabel }: {
  kind: 'area' | 'tag';
  value: NoteTagDraft;
  onChange: (patch: Partial<NoteTagDraft>) => void;
  onEnter: () => void;
  // The notebook being edited (left out of where it can go).
  selfId?: string | null;
  levelLabel: string;
}) {
  const noteTags = useNoteStore((s) => s.noteTags);
  const collections = useTaskStore((s) => s.collections);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isTag = kind === 'tag';
  const allCollections = Object.values(collections);
  const setParent = (parentId: NoteTagId | null) => { onChange({ parentId }); setPickerOpen(false); };
  const updateField = (id: string, patch: Partial<NoteTagFieldDef>) => onChange({ fieldSchema: value.fieldSchema.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  return (
    <>
      {!isTag && (
        <div className={styles.field} onKeyDown={(e) => { if (e.key === 'Escape' && pickerOpen) { e.stopPropagation(); setPickerOpen(false); } }}>
          <span className={styles.label}>{LABELS.notebookParent.label}</span>
          <div className={styles.parentRow}>
            <button type="button" className={styles.parentBtn} onClick={() => setPickerOpen((o) => !o)} title={LABELS.notebookParent.change} aria-expanded={pickerOpen}>
              <span className={styles.parentName}>{value.parentId ? notebookPath(value.parentId, noteTags) : LABELS.notebookParent.topLevel}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {value.parentId && (
              <button type="button" className={styles.parentClear} onClick={() => setParent(null)} title={LABELS.notebookParent.makeTopLevel} aria-label={LABELS.notebookParent.makeTopLevel}><CloseIcon /></button>
            )}
          </div>
          {pickerOpen && (
            <div className={styles.parentList}>
              <button type="button" className={`${styles.parentOption} ${value.parentId === null ? styles.parentOptionActive : ''}`} onClick={() => setParent(null)}>{LABELS.notebookParent.topLevel}</button>
              {flattenNotebooks(noteTags, selfId).map(({ tag, depth }) => (
                <button key={tag.id} type="button" className={`${styles.parentOption} ${value.parentId === tag.id ? styles.parentOptionActive : ''}`}
                  style={{ paddingLeft: `${0.6 + depth}rem` }} onClick={() => setParent(tag.id as NoteTagId)}>
                  <span className={styles.parentOptionIcon}><ItemIcon icon={tag.icon} fallback="📁" /></span>
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="nb-name" className={styles.label}>{L.name}</label>
        <input id="nb-name" autoFocus type="text" value={value.name} placeholder={L.namePlaceholder(levelLabel)} className={styles.input}
          onChange={(e) => onChange({ name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.iconPicker.label}</span>
          <IconField value={value.icon || null} onChange={(v) => onChange({ icon: v ?? '' })} fallback={isTag ? ANNOTATION_ICON : '📓'} />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{L.colour} <span className={styles.optional}>{L.optional}</span></span>
          <ColorPicker palette="standard" value={value.color} onChange={(color) => onChange({ color })} />
        </div>
      </div>

      {!isTag && allCollections.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.collection} <span className={styles.optional}>{L.optional}</span></span>
          <CollectionPicker collections={allCollections} value={value.collectionId} onChange={(collectionId) => onChange({ collectionId })} noneLabel={`No ${LABELS.collection}`} />
        </div>
      )}

      {!isTag && (
        <div className={styles.field}>
          <TagField value={value.suiteTagIds} onChange={(suiteTagIds) => onChange({ suiteTagIds })} labelClassName={styles.label}
            inherited={tagsFromNotebookPlace(value.parentId, value.collectionId, noteTags, collections)}
            fromName={(id) => sourceName(id, noteTags, collections)} />
        </div>
      )}

      {/* An annotation's attributes: fields to fill in on what's marked with it. */}
      {isTag && (
        <>
          <div className={styles.schemaDivider} />
          <div className={styles.schemaHeader}>
            <span className={styles.label}>{L.attributes}</span>
            <button type="button" className={styles.addFieldBtn} onClick={() => onChange({ fieldSchema: [...value.fieldSchema, { id: nanoid(8), name: '', type: 'text' }] })}>{L.addAttribute}</button>
          </div>
          {value.fieldSchema.length === 0 ? <p className={styles.schemaEmpty}>{L.noAttributes}</p> : value.fieldSchema.map((f) => (
            <div key={f.id} className={styles.fieldRow}>
              <input type="text" value={f.name} placeholder={L.attributeName} aria-label={L.attributeName} className={styles.fieldNameInput} onChange={(e) => updateField(f.id, { name: e.target.value })} />
              <select value={f.type} aria-label={L.attributeType} className={styles.fieldTypeSelect} onChange={(e) => updateField(f.id, { type: e.target.value as NoteTagFieldType })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{L.types[t]}</option>)}
              </select>
              <button type="button" className={styles.removeFieldBtn} onClick={() => onChange({ fieldSchema: value.fieldSchema.filter((x) => x.id !== f.id) })} title={L.remove} aria-label={L.remove}><TrashIcon width="1em" height="1em" /></button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

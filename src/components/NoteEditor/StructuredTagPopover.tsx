import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '@/store/taskStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import type { StructuredTagTypeDef } from '@/config/structuredTagTypes';
import type { CollectionId } from '@/types';
import styles from './StructuredTagPopover.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';

interface Props {
  top:  number;
  left: number;
  typeDef:  StructuredTagTypeDef;
  tagColor: string;
  tagIcon:  string;
  mode: 'create' | 'edit';
  initialTerm:         string;
  initialFields:       Record<string, string>;
  initialCollectionId: string | null;
  // Edit mode only — read-only context shown once expanded.
  meta?: { createdAt: string; updatedAt: string; breadcrumb: string };
  onSave:   (data: { term: string; fields: Record<string, string>; collectionId: string | null }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

// Shared creation-preview / edit popover for every structured tag type (Acronym today).
// Create mode opens compact (term + the type's first field only) with Enter accepting it
// as-is; "More options" expands the same popover in place to show every field, the
// Endeavour picker, and (edit mode) the read-only context/timestamps — rather than a
// separate full-edit surface, per the request that Enter-to-accept and "expand if you want
// more" live in one place.
export function StructuredTagPopover({
  top, left, typeDef, tagColor, tagIcon, mode,
  initialTerm, initialFields, initialCollectionId, meta,
  onSave, onCancel, onDelete,
}: Props) {
  const collections = useTaskStore((s) => Object.values(s.collections));
  const [term, setTerm]              = useState(initialTerm);
  const [fields, setFields]          = useState(initialFields);
  const [collectionId, setCollectionId] = useState<string | null>(initialCollectionId);
  const [expanded, setExpanded]      = useState(mode === 'edit');
  const rootRef = useRef<HTMLDivElement>(null);

  const setField = (id: string, value: string) => setFields((f) => ({ ...f, [id]: value }));

  const handleSave = () => {
    if (!term.trim()) return;
    onSave({ term: term.trim(), fields, collectionId });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCancel();
    };
    // mousedown deferred a tick so the click that opened this popover doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEscapeClose(onCancel);
  useCtrlEnterSubmit(() => handleSave());

  const compactField = typeDef.fields[0];

  return createPortal(
    <div
      ref={rootRef}
      className={styles.popover}
      style={{ top, left, borderLeft: `3px solid ${tagColor}` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.header}>
        <span className={styles.headerIcon}>{tagIcon}</span>
        <span className={styles.headerLabel}>{mode === 'create' ? `New ${typeDef.label}` : typeDef.label}</span>
      </div>

      <input
        autoFocus
        className={styles.input}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
        placeholder="Term"
      />

      {!expanded ? (
        compactField && (
          <input
            className={styles.input}
            value={fields[compactField.id] ?? ''}
            onChange={(e) => setField(compactField.id, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
            placeholder={compactField.placeholder ?? compactField.name}
          />
        )
      ) : (
        <>
          {typeDef.fields.map((f) => (
            <div key={f.id} className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>{f.name}</label>
              {f.type === 'textarea' ? (
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={fields[f.id] ?? ''}
                  onChange={(e) => setField(f.id, e.target.value)}
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  className={styles.input}
                  value={fields[f.id] ?? ''}
                  onChange={(e) => setField(f.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>{LABELS.collection}</label>
            <CollectionPicker
              collections={collections}
              value={collectionId}
              onChange={(id) => setCollectionId(id as CollectionId | null)}
            />
          </div>

          {meta && (
            <div className={styles.meta}>
              <div className={styles.metaRow}><span>Location</span><span>{meta.breadcrumb}</span></div>
              <div className={styles.metaRow}><span>Created</span><span>{new Date(meta.createdAt).toLocaleDateString()}</span></div>
              <div className={styles.metaRow}><span>Updated</span><span>{new Date(meta.updatedAt).toLocaleDateString()}</span></div>
            </div>
          )}
        </>
      )}

      <div className={styles.footer}>
        {!expanded ? (
          <button type="button" className={styles.linkBtn} onClick={() => setExpanded(true)}>More options…</button>
        ) : (
          onDelete ? (
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>Delete</button>
          ) : <span />
        )}
        <div className={styles.footerActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={!term.trim()}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

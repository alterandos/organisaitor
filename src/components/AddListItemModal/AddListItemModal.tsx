import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useListStore } from '@/store/listStore';
import { useListViews, useListItemViews } from '@/store/listViews';
import { useUIStore } from '@/store/uiStore';
import { LIST_ITEM_STATUS_META } from '@/types/lists';
import type { ListItemStatus, ListFieldSchema, ListId, ListItemId } from '@/types/lists';
import styles from './AddListItemModal.module.css';

// ── Dynamic field input ───────────────────────────────────────────────────────
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ListFieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const strVal = value == null ? '' : String(value);

  switch (field.type) {
    case 'text':
      return (
        <textarea
          className={styles.textarea}
          placeholder={field.name}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className={styles.input}
          placeholder="0"
          value={strVal}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className={styles.input}
          value={strVal}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'url':
      return (
        <input
          type="url"
          className={styles.input}
          placeholder="https://…"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'boolean':
      return (
        <label className={styles.boolLabel}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className={styles.boolCheck}
          />
          <span>{field.name}</span>
        </label>
      );
    case 'select':
      return (
        <select
          className={styles.select}
          value={strVal}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'rating': {
      const max = field.max ?? 5;
      const num = typeof value === 'number' ? value : 0;
      return (
        <div className={styles.ratingRow}>
          {Array.from({ length: max }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.ratingStar} ${i < num ? styles.ratingStarFilled : ''}`}
              onClick={() => onChange(i + 1 === num ? 0 : i + 1)}
              title={`${i + 1} star${i + 1 !== 1 ? 's' : ''}`}
            >★</button>
          ))}
          {num > 0 && (
            <button type="button" className={styles.ratingClear} onClick={() => onChange(0)}>✕</button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function AddListItemModal() {
  const lists          = useListViews();
  const listItems      = useListItemViews();
  const addListItem    = useListStore((s) => s.addListItem);
  const updateListItem = useListStore((s) => s.updateListItem);

  const closeModal             = useUIStore((s) => s.closeModal);
  const editingListItemId      = useUIStore((s) => s.editingListItemId);
  const pendingListItemListId  = useUIStore((s) => s.pendingListItemListId);
  const pendingListItemTabId   = useUIStore((s) => s.pendingListItemTabId);

  const isEditing  = !!editingListItemId;
  const existing   = editingListItemId ? listItems[editingListItemId as ListItemId] : null;
  const listId     = (existing?.listId ?? pendingListItemListId) as ListId | null;
  const list       = listId ? lists[listId] : null;

  const formRef = useRef<HTMLFormElement>(null);

  const [title,    setTitle]    = useState('');
  const [status,   setStatus]   = useState<ListItemStatus>('want');
  const [tabId,    setTabId]    = useState<string | null>(!isEditing ? (pendingListItemTabId ?? null) : null);
  const [data,     setData]     = useState<Record<string, unknown>>({});
  const [notes,    setNotes]    = useState('');
  const [links,    setLinks]    = useState<string[]>([]);
  const [newLink,  setNewLink]  = useState('');

  // Populate from existing item when editing; inherit pending tab for new items
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setStatus(existing.status);
      setTabId(existing.tabId ?? null);
      setData({ ...existing.data });
      setNotes(existing.notes ?? '');
      setLinks([...existing.links]);
    } else {
      setTabId(pendingListItemTabId ?? null);
    }
  }, [editingListItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const updateFieldData = (fieldId: string, value: unknown) => {
    setData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const addLink = () => {
    const url = newLink.trim();
    if (!url) return;
    setLinks((prev) => [...prev, url]);
    setNewLink('');
  };

  const removeLink = (idx: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!listId || !list) return;
    const isReference = list.kind === 'reference';
    if (!isReference && !title.trim()) return;
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v != null && v !== '' && v !== 0)
    );
    // For reference lists, derive a title from the first non-empty field value
    const effectiveTitle = isReference
      ? (Object.values(cleanData).find((v) => typeof v === 'string' && (v as string).trim()) as string | undefined ?? '')
      : title.trim();
    if (isEditing && editingListItemId) {
      updateListItem(editingListItemId as ListItemId, {
        title: effectiveTitle,
        status,
        tabId,
        data: cleanData,
        notes: notes.trim() || null,
        links,
      });
    } else {
      addListItem({
        listId,
        title: effectiveTitle,
        status,
        tabId,
        data: cleanData,
        notes: notes.trim() || null,
        links,
      });
    }
    closeModal();
  };

  if (!list) return null;

  // Use the selected tab's field schema if it has fields; fall back to list-level schema
  const activeTab = tabId ? list.tabs?.find((t) => t.id === tabId) : null;
  const fieldSchema: ListFieldSchema[] =
    (activeTab && activeTab.fieldSchema.length > 0)
      ? activeTab.fieldSchema
      : (list.fieldSchema ?? []);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.listBadge}>
              {list.icon ?? '📋'} {list.name}
            </span>
            <span className={styles.title}>{isEditing ? 'Edit item' : 'New item'}</span>
          </div>
          <button className={styles.closeBtn} onClick={closeModal}>✕</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          {/* Title — watchlist only; reference lists have no mandatory name */}
          {list.kind !== 'reference' && (
            <div className={styles.field}>
              <input
                className={`${styles.input} ${styles.titleInput}`}
                placeholder="Title…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          {/* Status — watchlist only */}
          {list.kind === 'watchlist' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Status</label>
              <div className={styles.statusRow}>
                {(Object.entries(LIST_ITEM_STATUS_META) as [ListItemStatus, { label: string; color: string }][]).map(([s, meta]) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.statusBtn} ${status === s ? styles.statusBtnActive : ''}`}
                    style={status === s ? { background: meta.color + '22', color: meta.color, borderColor: meta.color + '88' } : undefined}
                    onClick={() => setStatus(s)}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab picker — only when list has tabs */}
          {(list.tabs?.length ?? 0) > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Tab</label>
              <div className={styles.statusRow}>
                <button
                  type="button"
                  className={`${styles.statusBtn} ${tabId === null ? styles.statusBtnActive : ''}`}
                  onClick={() => setTabId(null)}
                >
                  None
                </button>
                {list.tabs!.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.statusBtn} ${tabId === tab.id ? styles.statusBtnActive : ''}`}
                    style={tabId === tab.id && tab.color ? { background: tab.color + '22', color: tab.color, borderColor: tab.color + '88' } : undefined}
                    onClick={() => setTabId(tab.id)}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic fields from schema */}
          {fieldSchema.map((field) => (
            <div key={field.id} className={`${styles.field} ${field.type === 'boolean' ? styles.fieldInline : ''}`}>
              {field.type !== 'boolean' && (
                <label className={styles.fieldLabel}>
                  {field.name}
                  {field.required && <span className={styles.required}> *</span>}
                </label>
              )}
              <FieldInput
                field={field}
                value={data[field.id]}
                onChange={(v) => updateFieldData(field.id, v)}
              />
            </div>
          ))}

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Notes</label>
            <textarea
              className={`${styles.textarea} ${styles.notesTextarea}`}
              placeholder="Notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Links */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Links</label>
            {links.length > 0 && (
              <div className={styles.linkList}>
                {links.map((url, idx) => {
                  let display = url;
                  try { display = new URL(url).hostname.replace(/^www\./, ''); } catch {}
                  return (
                    <div key={idx} className={styles.linkRow}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.linkPreview}>{display}</a>
                      <button type="button" className={styles.removeLinkBtn} onClick={() => removeLink(idx)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={styles.addLinkRow}>
              <input
                type="url"
                className={styles.input}
                placeholder="https://…"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
              />
              <button type="button" className={styles.addLinkBtn} onClick={addLink}>Add</button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={list?.kind !== 'reference' && !title.trim()}
            >
              {isEditing ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

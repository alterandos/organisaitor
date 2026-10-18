import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useListStore } from '@/store/listStore';
import { useListViews, useListItemViews } from '@/store/listViews';
import { useUIStore } from '@/store/uiStore';
import { LIST_ITEM_STATUS_META } from '@/types/lists';
import type { ListItemStatus, ListFieldSchema, ListId, ListItemId } from '@/types/lists';
import styles from './AddListItemModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { LABELS } from '@/config/labels';
import { CloseIcon, TrashIcon } from '@/components/Icons';

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
            <button type="button" className={styles.ratingClear} onClick={() => onChange(0)} aria-label="Clear"><CloseIcon /></button>
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
  // A type that names its items by their title (the Dictionary's word): the form asks for it, and
  // it is never derived from the first field.
  const titleColumn = useListStore((s) => (list?.typeId ? s.listTypes[list.typeId]?.titleColumn : undefined));

  const formRef = useRef<HTMLFormElement>(null);

  const [title,    setTitle]    = useState(() => existing?.title ?? '');
  const [status,   setStatus]   = useState<ListItemStatus>(() => existing?.status ?? 'want');
  const [tabId,    setTabId]    = useState<string | null>(() => existing ? (existing.tabId ?? null) : !isEditing ? (pendingListItemTabId ?? null) : null);
  const [data,     setData]     = useState<Record<string, unknown>>(() => existing ? { ...existing.data } : {});
  const [notes,    setNotes]    = useState(() => existing?.notes ?? '');
  const [links,    setLinks]    = useState<string[]>(() => existing ? [...existing.links] : []);
  const [newLink,  setNewLink]  = useState('');

  useEscapeClose(() => { closeModal(); });

  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

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
    const isReference = list.kind === 'reference' && !titleColumn;
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
            <span className={styles.title}>{isEditing ? LABELS.lists.form.editTitle : LABELS.lists.form.newTitle}</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={closeModal} title={LABELS.lists.form.close} aria-label={LABELS.lists.form.close}><CloseIcon /></button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          {/* Title — watchlist only; reference lists have no mandatory name */}
          {(list.kind !== 'reference' || titleColumn) && (
            <div className={styles.field}>
              <input
                className={`${styles.input} ${styles.titleInput}`}
                aria-label={titleColumn ?? LABELS.lists.form.title}
                placeholder={`${titleColumn ?? LABELS.lists.form.title}…`}
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
              <label className={styles.fieldLabel}>{LABELS.lists.form.status}</label>
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
              <label className={styles.fieldLabel}>{LABELS.lists.form.tab}</label>
              <div className={styles.statusRow}>
                <button
                  type="button"
                  className={`${styles.statusBtn} ${tabId === null ? styles.statusBtnActive : ''}`}
                  onClick={() => setTabId(null)}
                >
                  {LABELS.lists.form.noTab}
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
            <label className={styles.fieldLabel}>{LABELS.lists.form.notes}</label>
            <textarea
              className={`${styles.textarea} ${styles.notesTextarea}`}
              placeholder={LABELS.lists.form.notesHint}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Links */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{LABELS.lists.form.links}</label>
            {links.length > 0 && (
              <div className={styles.linkList}>
                {links.map((url, idx) => {
                  let display = url;
                  try { display = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a URL: show it as typed */ }
                  return (
                    <div key={idx} className={styles.linkRow}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.linkPreview}>{display}</a>
                      <button type="button" className={styles.removeLinkBtn} onClick={() => removeLink(idx)} title={LABELS.lists.form.removeLink} aria-label={LABELS.lists.form.removeLink}><TrashIcon width="1em" height="1em" /></button>
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
              <button type="button" className={styles.addLinkBtn} onClick={addLink}>{LABELS.lists.form.addLink}</button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>{LABELS.lists.form.cancel}</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={(list?.kind !== 'reference' || !!titleColumn) && !title.trim()}
            >
              {isEditing ? LABELS.lists.form.save : LABELS.lists.form.add}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

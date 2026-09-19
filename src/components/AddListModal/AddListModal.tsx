import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { nanoid } from 'nanoid';
import { useListStore } from '@/store/listStore';
import { useListViews } from '@/store/listViews';
import { onVaultStatus } from '@/services/vault';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import type { ListId, ListFieldSchema, ListFieldType, ListTypeId, ListTab } from '@/types/lists';
import styles from './AddListModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

const FIELD_TYPES: { value: ListFieldType; label: string }[] = [
  { value: 'text',    label: 'Text'    },
  { value: 'number',  label: 'Number'  },
  { value: 'date',    label: 'Date'    },
  { value: 'rating',  label: 'Rating'  },
  { value: 'select',  label: 'Select'  },
  { value: 'boolean', label: 'Yes / No'},
  { value: 'url',     label: 'URL'     },
];

const EMOJI_PRESETS = ['📋', '🎬', '📚', '📺', '🎵', '🔬', '📍', '🎮', '🍽️', '✈️', '💡', '⭐'];

export function AddListModal() {
  const lists      = useListViews();
  const listTypes  = useListStore((s) => s.listTypes);
  const addList    = useListStore((s) => s.addList);
  const updateList = useListStore((s) => s.updateList);
  const encryptList = useListStore((s) => s.encryptList);
  const closeModal       = useUIStore((s) => s.closeModal);
  const editingListId    = useUIStore((s) => s.editingListId);

  const isEditing = !!editingListId;
  const existing  = editingListId ? lists[editingListId as ListId] : null;

  const formRef = useRef<HTMLFormElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<ListTypeId | null>(null);
  const [color,       setColor]       = useState<string | null>(null);
  const [icon,        setIcon]        = useState<string | null>(null);
  const [fields,      setFields]      = useState<ListFieldSchema[]>([]);
  const [tabs,        setTabs]        = useState<ListTab[]>([]);
  const [typeChosen,  setTypeChosen]  = useState(false);
  const [newSelectOption,    setNewSelectOption]    = useState<Record<string, string>>({});
  const [newTabSelectOption, setNewTabSelectOption] = useState<Record<string, string>>({});
  const [expandedTabs, setExpandedTabs] = useState<Set<number>>(new Set());
  const [encryptOnCreate, setEncryptOnCreate] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  useEffect(() => onVaultStatus((s) => setVaultUnlocked(s === 'unlocked')), []);

  // Populate from existing when editing
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setSelectedTypeId(existing.typeId);
      setColor(existing.color);
      setIcon(existing.icon);
      setFields(existing.fieldSchema.map((f: ListFieldSchema) => ({ ...f, options: f.options ? [...f.options] : undefined })));
      setTabs(existing.tabs ? existing.tabs.map((t) => ({ ...t, fieldSchema: t.fieldSchema ? [...t.fieldSchema] : [] })) : []);
      setTypeChosen(true);
    }
  }, [editingListId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEscapeClose(() => { closeModal(); });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const handleSelectType = (typeId: ListTypeId) => {
    const type = listTypes[typeId];
    if (!type) return;
    setSelectedTypeId(typeId);
    setColor(type.color);
    setIcon(type.icon ?? null);
    setFields(type.defaultFields.map((f) => ({
      ...f,
      id: nanoid(8),
      options: f.options ? [...f.options] : undefined,
    })));
    setTypeChosen(true);
  };

  // ── List-level field helpers ────────────────────────────────────────────────
  const addField = () => setFields((prev) => [...prev, { id: nanoid(8), name: '', type: 'text' }]);

  const updateField = (idx: number, patch: Partial<ListFieldSchema>) =>
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));

  const removeField = (idx: number) => setFields((prev) => prev.filter((_, i) => i !== idx));

  const addSelectOption = (fieldIdx: number) => {
    const val = (newSelectOption[String(fieldIdx)] ?? '').trim();
    if (!val) return;
    setFields((prev) => prev.map((f, i) => i === fieldIdx
      ? { ...f, options: [...(f.options ?? []), val] }
      : f
    ));
    setNewSelectOption((prev) => ({ ...prev, [String(fieldIdx)]: '' }));
  };

  const removeSelectOption = (fieldIdx: number, optIdx: number) =>
    setFields((prev) => prev.map((f, i) => i === fieldIdx
      ? { ...f, options: f.options?.filter((_, oi) => oi !== optIdx) }
      : f
    ));

  // ── Tab helpers ─────────────────────────────────────────────────────────────
  const addTab = () =>
    setTabs((prev) => [...prev, { id: nanoid(8), name: '', color: null, fieldSchema: [] }]);

  const updateTab = (idx: number, patch: Partial<ListTab>) =>
    setTabs((prev) => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));

  const removeTab = (idx: number) =>
    setTabs((prev) => prev.filter((_, i) => i !== idx));

  const toggleTabExpand = (idx: number) =>
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });

  // ── Per-tab field helpers ───────────────────────────────────────────────────
  const addTabField = (tabIdx: number) =>
    setTabs((prev) => prev.map((t, i) => i === tabIdx
      ? { ...t, fieldSchema: [...t.fieldSchema, { id: nanoid(8), name: '', type: 'text' as ListFieldType }] }
      : t
    ));

  const updateTabField = (tabIdx: number, fieldIdx: number, patch: Partial<ListFieldSchema>) =>
    setTabs((prev) => prev.map((t, i) => i === tabIdx
      ? { ...t, fieldSchema: t.fieldSchema.map((f, fi) => fi === fieldIdx ? { ...f, ...patch } : f) }
      : t
    ));

  const removeTabField = (tabIdx: number, fieldIdx: number) =>
    setTabs((prev) => prev.map((t, i) => i === tabIdx
      ? { ...t, fieldSchema: t.fieldSchema.filter((_, fi) => fi !== fieldIdx) }
      : t
    ));

  const addTabSelectOption = (tabIdx: number, fieldIdx: number) => {
    const key = `${tabIdx}-${fieldIdx}`;
    const val = (newTabSelectOption[key] ?? '').trim();
    if (!val) return;
    setTabs((prev) => prev.map((t, i) => i === tabIdx
      ? { ...t, fieldSchema: t.fieldSchema.map((f, fi) => fi === fieldIdx
          ? { ...f, options: [...(f.options ?? []), val] }
          : f
        )}
      : t
    ));
    setNewTabSelectOption((prev) => ({ ...prev, [key]: '' }));
  };

  const removeTabSelectOption = (tabIdx: number, fieldIdx: number, optIdx: number) =>
    setTabs((prev) => prev.map((t, i) => i === tabIdx
      ? { ...t, fieldSchema: t.fieldSchema.map((f, fi) => fi === fieldIdx
          ? { ...f, options: f.options?.filter((_, oi) => oi !== optIdx) }
          : f
        )}
      : t
    ));

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const validFields = fields.filter((f) => f.name.trim());
    const validTabs   = tabs.filter((t) => t.name.trim()).map((t) => ({
      ...t,
      fieldSchema: t.fieldSchema.filter((f) => f.name.trim()),
    }));
    if (isEditing && editingListId) {
      updateList(editingListId as any, {
        name: name.trim(),
        description: description.trim() || null,
        color,
        icon,
        fieldSchema: validFields,
        tabs: validTabs,
      });
    } else {
      const newId = addList({
        name: name.trim(),
        description: description.trim() || null,
        typeId: selectedTypeId,
        color,
        icon,
        fieldSchema: validFields,
        tabs: validTabs,
      });
      if (encryptOnCreate && vaultUnlocked) {
        encryptList(newId).catch((err) => {
          console.error('[AddListModal] could not encrypt the new list:', err);
          window.alert(err instanceof Error ? err.message : 'Could not encrypt this list.');
        });
      }
    }
    closeModal();
  };

  const allTypes       = Object.values(listTypes);
  const watchlistTypes = allTypes.filter((t) => t.kind === 'watchlist');
  const referenceTypes = allTypes.filter((t) => t.kind !== 'watchlist');

  // Helper to render a field row (reused for list-level and per-tab)
  const renderFieldRow = (
    field: ListFieldSchema,
    _idx: number,
    onUpdate: (patch: Partial<ListFieldSchema>) => void,
    onRemove: () => void,
    onAddOption: (optionValue: string) => void,
    onRemoveOption: (optIdx: number) => void,
    newOptionValue: string,
    onNewOptionChange: (v: string) => void,
  ) => (
    <div key={field.id} className={styles.fieldRow}>
      <input
        className={styles.fieldNameInput}
        placeholder="Field name"
        value={field.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
      />
      <select
        className={styles.fieldTypeSelect}
        value={field.type}
        onChange={(e) => onUpdate({ type: e.target.value as ListFieldType, options: undefined })}
      >
        {FIELD_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      {field.type === 'rating' && (
        <select
          className={styles.fieldMaxSelect}
          value={field.max ?? 5}
          onChange={(e) => onUpdate({ max: Number(e.target.value) })}
          title="Max stars"
        >
          {[3, 5, 10].map((n) => <option key={n} value={n}>{n} ★</option>)}
        </select>
      )}
      <label className={styles.requiredLabel}>
        <input type="checkbox" checked={!!field.required} onChange={(e) => onUpdate({ required: e.target.checked })} />
        Req.
      </label>
      <button type="button" className={styles.removeFieldBtn} onClick={onRemove} title="Remove field">✕</button>

      {field.type === 'select' && (
        <div className={styles.selectOptions}>
          <div className={styles.selectOptionsList}>
            {(field.options ?? []).map((opt, oi) => (
              <span key={oi} className={styles.selectOptionTag}>
                {opt}
                <button type="button" className={styles.removeOptionBtn} onClick={() => onRemoveOption(oi)}>✕</button>
              </span>
            ))}
          </div>
          <div className={styles.addOptionRow}>
            <input
              className={styles.addOptionInput}
              placeholder="Add option…"
              value={newOptionValue}
              onChange={(e) => onNewOptionChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddOption(newOptionValue); } }}
            />
            <button type="button" className={styles.addOptionBtn} onClick={() => onAddOption(newOptionValue)}>Add</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Two-step create flow: type picker first ────────────────────────────────
  if (!isEditing && !typeChosen) {
    return (
      <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className={`${styles.modal} ${styles.modalLarge}`}>
          <div className={styles.header}>
            <span className={styles.title}>Choose a list type</span>
            <button className={styles.closeBtn} onClick={closeModal}>✕</button>
          </div>

          {watchlistTypes.length > 0 && (
            <>
              <div className={styles.typeSectionLabel}>Watchlists</div>
              <div className={styles.typeGrid}>
                {watchlistTypes.map((type) => (
                  <button
                    key={type.id}
                    className={styles.typeCard}
                    style={type.color ? { '--type-color': type.color } as React.CSSProperties : undefined}
                    onClick={() => handleSelectType(type.id)}
                  >
                    <span className={styles.typeCardIcon}>{type.icon}</span>
                    <span className={styles.typeCardName}>{type.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {referenceTypes.length > 0 && (
            <>
              <div className={styles.typeSectionLabel}>Reference &amp; Admin</div>
              <div className={styles.typeGrid}>
                {referenceTypes.map((type) => (
                  <button
                    key={type.id}
                    className={styles.typeCard}
                    style={type.color ? { '--type-color': type.color } as React.CSSProperties : undefined}
                    onClick={() => handleSelectType(type.id)}
                  >
                    <span className={styles.typeCardIcon}>{type.icon}</span>
                    <span className={styles.typeCardName}>{type.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className={styles.typeSkip}>
            <button className={styles.skipBtn} onClick={() => setTypeChosen(true)}>
              Skip — start blank
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main create/edit form ──────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={`${styles.modal} ${styles.modalLarge}`}>
        <div className={styles.header}>
          <span className={styles.title}>{isEditing ? 'Edit List' : 'New List'}</span>
          <button className={styles.closeBtn} onClick={closeModal}>✕</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          {/* Name + icon row */}
          <div className={styles.nameRow}>
            <div className={styles.iconPickerWrap}>
              <span className={styles.iconPreview}>{icon ?? (selectedTypeId ? listTypes[selectedTypeId]?.icon : null) ?? '📋'}</span>
              <div className={styles.emojiGrid}>
                {EMOJI_PRESETS.map((e) => (
                  <button key={e} type="button" className={`${styles.emojiBtn} ${icon === e ? styles.emojiBtnActive : ''}`} onClick={() => setIcon(icon === e ? null : e)}>{e}</button>
                ))}
              </div>
            </div>
            <input
              className={styles.nameInput}
              placeholder="List name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className={styles.field}>
            <input
              className={styles.input}
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Color */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Colour</label>
            <ColorPicker value={color} onChange={setColor} palette="light" />
          </div>

          {/* List-level field schema editor */}
          <div className={styles.schemaSection}>
            <div className={styles.schemaSectionHeader}>
              <span className={styles.schemaSectionTitle}>Default fields</span>
              <button type="button" className={styles.addFieldBtn} onClick={addField}>+ Add field</button>
            </div>
            {fields.length === 0 && (
              <p className={styles.schemaEmpty}>No default fields. Tabs can define their own fields below.</p>
            )}
            <div className={styles.fieldList}>
              {fields.map((field, idx) =>
                renderFieldRow(
                  field, idx,
                  (patch) => updateField(idx, patch),
                  () => removeField(idx),
                  () => addSelectOption(idx),
                  (oi) => removeSelectOption(idx, oi),
                  newSelectOption[String(idx)] ?? '',
                  (v) => setNewSelectOption((p) => ({ ...p, [String(idx)]: v })),
                )
              )}
            </div>
          </div>

          {/* Tabs editor */}
          <div className={styles.schemaSection}>
            <div className={styles.schemaSectionHeader}>
              <span className={styles.schemaSectionTitle}>Tabs</span>
              <button type="button" className={styles.addFieldBtn} onClick={addTab}>+ Add tab</button>
            </div>

            {tabs.length === 0 && (
              <p className={styles.schemaEmpty}>No tabs — items shown in a flat list. Add tabs to group items (e.g. "Comedy", "Action").</p>
            )}

            {tabs.length > 0 && (
              <div className={styles.tabList}>
                {tabs.map((tab, idx) => (
                  <div key={tab.id} className={styles.tabGroup}>
                    <div className={styles.tabRow}>
                      <input
                        type="color"
                        className={styles.tabColorInput}
                        value={tab.color ?? '#6b7280'}
                        onChange={(e) => updateTab(idx, { color: e.target.value })}
                        title="Tab colour"
                      />
                      <input
                        className={styles.tabNameInput}
                        placeholder="Tab name…"
                        value={tab.name}
                        onChange={(e) => updateTab(idx, { name: e.target.value })}
                      />
                      <button
                        type="button"
                        className={styles.tabExpandBtn}
                        onClick={() => toggleTabExpand(idx)}
                        title={expandedTabs.has(idx) ? 'Hide fields' : 'Custom fields'}
                      >
                        {expandedTabs.has(idx) ? '▾' : '▸'} Fields{tab.fieldSchema.length > 0 ? ` (${tab.fieldSchema.length})` : ''}
                      </button>
                      <button type="button" className={styles.removeFieldBtn} onClick={() => removeTab(idx)} title="Remove tab">✕</button>
                    </div>

                    {expandedTabs.has(idx) && (
                      <div className={styles.tabFieldEditor}>
                        <div className={styles.tabFieldHeader}>
                          <span className={styles.tabFieldHint}>
                            {tab.fieldSchema.length === 0
                              ? 'Uses default fields. Add fields here to override for this tab.'
                              : 'These fields replace default fields for items in this tab.'}
                          </span>
                          <button type="button" className={styles.addFieldBtn} onClick={() => addTabField(idx)}>+ Add field</button>
                        </div>
                        <div className={styles.fieldList}>
                          {tab.fieldSchema.map((field, fieldIdx) =>
                            renderFieldRow(
                              field, fieldIdx,
                              (patch) => updateTabField(idx, fieldIdx, patch),
                              () => removeTabField(idx, fieldIdx),
                              () => addTabSelectOption(idx, fieldIdx),
                              (oi) => removeTabSelectOption(idx, fieldIdx, oi),
                              newTabSelectOption[`${idx}-${fieldIdx}`] ?? '',
                              (v) => setNewTabSelectOption((p) => ({ ...p, [`${idx}-${fieldIdx}`]: v })),
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isEditing && (
            <label className={styles.encryptRow} title={vaultUnlocked ? undefined : 'Set up or unlock encryption in Account first'}>
              <input
                type="checkbox"
                checked={encryptOnCreate && vaultUnlocked}
                disabled={!vaultUnlocked}
                onChange={(e) => setEncryptOnCreate(e.target.checked)}
              />
              <span>🔒 Encrypt this list</span>
              {!vaultUnlocked && <span className={styles.encryptHint}>Unlock encryption in Account to enable</span>}
            </label>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!name.trim()}
              style={color ? { background: color, borderColor: color } : undefined}
            >
              {isEditing ? 'Save changes' : 'Create list'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

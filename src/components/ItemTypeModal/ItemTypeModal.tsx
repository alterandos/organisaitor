import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { IconField } from '@/components/IconPicker/IconField';
import { iconText } from '@/components/IconPicker/iconValue';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { canExtend, pickableTypes, resolveItemType, typeDescendants } from '@/utils/itemTypes';
import { itemsOfType, newFieldId } from '@/services/itemTypes';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import type { FieldSchema, FieldType, ItemTypeId, TagId, TypeableKind, TypePart } from '@/types';
import styles from './ItemTypeModal.module.css';

// Making or editing a Type (docs/features/endeavours.md phase 3): its name and icon, what it's a
// kind of, what it's usually made as, its defaults, its fields and its parts. Opened from Manage →
// Types; it sits above Manage (z-index --z-pane-modal).

const L = LABELS.itemTypes;
const MAKE_AS: TypeableKind[] = ['task', 'event', 'deadline'];

export function ItemTypeModal() {
  const editingId  = useUIStore((s) => s.editingItemTypeId);
  const closeModal = useUIStore((s) => s.closeModal);
  const types      = useItemTypeStore((s) => s.types);
  const tags       = useTaskStore((s) => s.tags);
  const editing    = editingId ? types[editingId] : undefined;

  const [name,      setName]      = useState(() => editing?.name ?? '');
  const [icon,      setIcon]      = useState<string | null>(() => editing?.icon ?? null);
  const [extendsId, setExtendsId] = useState<ItemTypeId | null>(() => editing?.extendsId ?? null);
  const [makeAs,    setMakeAs]    = useState<TypeableKind | ''>(() => editing?.defaults.makeAs ?? '');
  const [important, setImportant] = useState(() => !!editing?.defaults.important);
  const [tagIds,    setTagIds]    = useState<TagId[]>(() => editing?.defaults.tagIds ?? []);
  const [fields,    setFields]    = useState<FieldSchema[]>(() => editing?.fields ?? []);
  const [parts,     setParts]     = useState<TypePart[]>(() => editing?.parts ?? []);
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const parent = extendsId ? resolveItemType(types, extendsId) : null;
  const parentOptions = pickableTypes(types, extendsId).filter((t) => canExtend(types, editingId, t.id) === null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const data = {
      name: name.trim(), icon, extendsId,
      fields: fields.filter((f) => f.name.trim()).map((f) => ({ ...f, name: f.name.trim() })),
      parts:  parts.filter((p) => p.title.trim()).map((p) => ({ ...p, title: p.title.trim() })),
      defaults: {
        ...(makeAs ? { makeAs } : {}),
        ...(important ? { important } : {}),
        ...(tagIds.length ? { tagIds } : {}),
      },
    };
    if (editing) useItemTypeStore.getState().updateItemType(editing.id, data);
    else useItemTypeStore.getState().addItemType(data);
    closeModal();
  }

  async function handleDelete() {
    if (!editing) return;
    const used = itemsOfType(editing.id);
    const kids = typeDescendants(types, editing.id).filter((t) => t.extendsId === editing.id);
    if (!(await confirmDelete(L.noun.toLowerCase(), editing.name, L.deleteDetail(used, kids.length), { empty: used === 0 && kids.length === 0 }))) return;
    for (const k of kids) useItemTypeStore.getState().updateItemType(k.id, { extendsId: null });
    useItemTypeStore.getState().deleteItemType(editing.id);
    closeModal();
  }

  function toggleArchive() {
    if (!editing) return;
    useItemTypeStore.getState().updateItemType(editing.id, { archivedAt: editing.archivedAt ? null : now() });
    closeModal();
  }

  const patchField = (i: number, patch: Partial<FieldSchema>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const patchPart  = (i: number, patch: Partial<TypePart>)    => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="itm-title">
        <div className={styles.header}>
          <span id="itm-title" className={styles.title}>
            {editing ? L.editTitle : L.newTitle}
            {editing?.archivedAt && <span className={styles.badge}>{L.archived}</span>}
          </span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.cancel}><CloseIcon /></button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.body}>
            <div className={styles.nameRow}>
              <IconField value={icon} onChange={setIcon} fallback="🏷️" label={L.icon} />
              <input
                className={styles.input}
                aria-label={L.name}
                placeholder={L.namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>{L.extends}</span>
                <select className={styles.select} value={extendsId ?? ''} onChange={(e) => setExtendsId((e.target.value || null) as ItemTypeId | null)}>
                  <option value="">{L.extendsNone}</option>
                  {parentOptions.map((t) => (
                    <option key={t.id} value={t.id}>{[iconText(t.icon), t.name].filter(Boolean).join(' ')}</option>
                  ))}
                </select>
                {parent && <span className={styles.hint}>{L.extendsHint(parent.type.name)}</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{L.makeAs}</span>
                <select className={styles.select} value={makeAs} onChange={(e) => setMakeAs(e.target.value as TypeableKind | '')}>
                  <option value="">{parent?.defaults.makeAs ? `${L.makeAsKinds[parent.defaults.makeAs]} (${L.inherited(parent.type.name)})` : L.makeAsKinds.task}</option>
                  {MAKE_AS.map((k) => <option key={k} value={k}>{L.makeAsKinds[k]}</option>)}
                </select>
              </label>
            </div>

            <label className={styles.check}>
              <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
              {L.important}
            </label>

            {tagIds.length > 0 && (
              <div className={styles.field}>
                <span className={styles.label}>{L.addsTags}</span>
                <div className={styles.chips}>
                  {tagIds.map((t) => (
                    <span key={t} className={styles.chip}>
                      {tags[t]?.name ?? t}
                      <button type="button" className={styles.chipX} aria-label={`${L.removeField}: ${tags[t]?.name ?? t}`} onClick={() => setTagIds((ts) => ts.filter((x) => x !== t))}><CloseIcon /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className={styles.section} aria-labelledby="itm-fields">
              <h3 id="itm-fields" className={styles.label}>{L.fields}</h3>
              <p className={styles.hint}>{L.fieldsHint}</p>
              {parent && parent.fields.length > 0 && (
                <p className={styles.inherited}>{L.inherited(parent.type.name)}: {parent.fields.map((f) => f.name).join(', ')}</p>
              )}
              {fields.map((f, i) => (
                <div key={f.id} className={styles.row}>
                  <input className={styles.input} aria-label={L.fieldName} placeholder={L.fieldName} value={f.name} onChange={(e) => patchField(i, { name: e.target.value })} />
                  <select className={styles.selectSmall} aria-label={L.fieldType} value={f.type} onChange={(e) => patchField(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {f.type === 'select' && (
                    <input
                      className={`${styles.input} ${styles.wide}`}
                      aria-label={L.fieldOptions}
                      placeholder={L.fieldOptions}
                      defaultValue={(f.options ?? []).join(', ')}
                      onChange={(e) => patchField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                    />
                  )}
                  {f.type === 'number' && (
                    <input className={styles.inputSmall} aria-label={L.fieldUnit} placeholder={L.fieldUnit} value={f.unit ?? ''} onChange={(e) => patchField(i, { unit: e.target.value || undefined })} />
                  )}
                  <button type="button" className={styles.iconBtn} aria-label={L.removeField} title={L.removeField} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><TrashIcon width="1em" height="1em" /></button>
                </div>
              ))}
              <button type="button" className={styles.addBtn} onClick={() => setFields((fs) => [...fs, { id: newFieldId(), name: '', type: 'text' }])}>{L.addField}</button>
            </section>

            <section className={styles.section} aria-labelledby="itm-parts">
              <h3 id="itm-parts" className={styles.label}>{L.parts}</h3>
              <p className={styles.hint}>{L.partsHint}</p>
              {parent && parent.parts.length > 0 && (
                <p className={styles.inherited}>{L.inherited(parent.type.name)}: {parent.parts.map((p) => `${p.title} (${L.partWhen(p.kind, p.offsetDays)})`).join(', ')}</p>
              )}
              {parts.map((p, i) => (
                <div key={p.id} className={styles.row}>
                  <input className={styles.input} aria-label={L.partTitle} placeholder={L.partTitle} value={p.title} onChange={(e) => patchPart(i, { title: e.target.value })} />
                  <select className={styles.selectSmall} aria-label={L.parts} value={p.kind} onChange={(e) => patchPart(i, { kind: e.target.value as TypePart['kind'] })}>
                    <option value="task">{L.partBefore}</option>
                    <option value="followUp">{L.partAfter}</option>
                  </select>
                  <input
                    className={styles.inputSmall}
                    type="number"
                    min={0}
                    aria-label={L.partWhen(p.kind, 2)}
                    value={p.offsetDays}
                    onChange={(e) => patchPart(i, { offsetDays: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <button type="button" className={styles.iconBtn} aria-label={L.removePart} title={L.removePart} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}><TrashIcon width="1em" height="1em" /></button>
                </div>
              ))}
              <button type="button" className={styles.addBtn} onClick={() => setParts((ps) => [...ps, { id: newFieldId(), kind: 'task', title: '', offsetDays: 1 }])}>{L.addPart}</button>
            </section>
          </div>

          <div className={styles.actions}>
            {editing && (
              <>
                <button type="button" className={styles.secondaryBtn} onClick={toggleArchive}>{editing.archivedAt ? L.restore : L.archive}</button>
                <button type="button" className={styles.dangerBtn} onClick={handleDelete}>{L.delete}</button>
              </>
            )}
            <span className={styles.spacer} />
            <button type="button" className={styles.secondaryBtn} onClick={closeModal}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>{editing ? L.save : L.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

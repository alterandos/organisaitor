import { TYPES_ENABLED } from '@/config/features';
import { templateFor } from '@/services/templates';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { FieldInput } from '@/components/FieldInput/FieldInput';
import { PeriodField } from '@/components/PeriodField/PeriodField';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { iconText } from '@/components/IconPicker/iconValue';
import { showToast } from '@/components/Toast/showToast';
import { addBuiltInType } from '@/services/itemTypes';
import { addOwnField, periodImpact, removeOwnField, saveFieldsAsType, setAttributeValue, setEndeavourType, updateOwnField } from '@/services/endeavourAttributes';
import { attributeFields, attributeValue, hasPeriodField, inheritedAttributes } from '@/utils/endeavourAttributes';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { formatFieldValue, hasFieldValue, pickableTypes } from '@/utils/itemTypes';
import { formatDate } from '@/utils/date';
import { ENDEAVOUR_DEFAULTS } from '@/config/builtInTypes';
import { FIELD_TYPE_OPTIONS } from '@/config/fieldTypes';
import { LABELS } from '@/config/labels';
import type { CollectionId, FieldType, ItemTypeId } from '@/types';
import styles from './EndeavourAttributes.module.css';

// An Endeavour's attributes, in their own pane (docs/features/endeavours.md "Attributes and Types
// for Endeavours", agreed with the user 2026-10-30): its Type (one of theirs, or a default, which
// gives them their own copy), its Type's fields and its own, each filled in as it changes; what it
// takes from above; "+ Field"; and saving its fields as a Type. The edit panes show a summary.

const L = LABELS.attributes;
const day = (iso: string | null) => (iso ? formatDate(iso + 'T00:00:00') : '…');

export function EndeavourAttributesPane() {
  const closeModal = useUIStore((s) => s.closeEndeavourAttributes);
  const id = useUIStore((s) => s.attributesFor);
  const collections = useTaskStore((s) => s.collections);
  const types = useItemTypeStore((s) => s.types);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');
  const [typeName, setTypeName] = useState('');
  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => closeModal());
  const c = id ? collections[id] : undefined;
  if (!c || !id) return null;

  const fields = attributeFields(c, types);
  const inherited = inheritedAttributes(id, collections, types);
  const typeId = c.attributes?.typeId ?? null;
  const typeOptions = pickableTypes(types, typeId, 'endeavour');
  const kinds = [...FIELD_TYPE_OPTIONS, ...(hasPeriodField(fields) ? [] : [{ value: 'period' as FieldType, label: L.periodKind }])];

  function chooseType(v: string) {
    const tid = v.startsWith('default:') ? addBuiltInType(v.slice('default:'.length)) : (v || null) as ItemTypeId | null;
    setEndeavourType(id!, tid);
  }

  async function removeField(fieldId: string, name: string, isPeriod: boolean) {
    if (isPeriod) {
      const n = periodImpact(id!);
      const ok = await confirmDialog({ title: L.removePeriodTitle(name), message: L.removePeriodImpact(n), confirmLabel: L.remove, destructive: true });
      if (!ok) return;
    }
    removeOwnField(id!, fieldId);
  }

  function addField(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    addOwnField(id!, { name: newName.trim(), type: newType });
    setNewName('');
    setNewType('text');
  }

  function saveAsType(e: FormEvent) {
    e.preventDefault();
    if (saveFieldsAsType(id!, typeName)) { showToast({ message: L.savedAsType(typeName.trim()) }); setTypeName(''); }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="attr-title">
        <div className={styles.header}>
          <h2 id="attr-title" className={styles.title}>{L.title(c.name)}</h2>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          {/* Types are switched off for now (config/features.ts): no Type to choose or save. */}
          {TYPES_ENABLED && <label className={styles.row}>
            <span className={styles.label}>{L.type}</span>
            <select className={styles.select} value={typeId ?? ''} onChange={(e) => chooseType(e.target.value)}>
              <option value="">{L.noType}</option>
              {typeOptions.map((t) => <option key={t.id} value={t.id}>{[iconText(t.icon), t.name].filter(Boolean).join(' ')}</option>)}
              <optgroup label={L.defaults}>
                {ENDEAVOUR_DEFAULTS.map((d) => <option key={d.key} value={`default:${d.key}`}>{`${d.icon} ${d.name}`}</option>)}
              </optgroup>
            </select>
            {typeId && <button type="button" className={styles.linkBtn} onClick={() => useUIStore.getState().openEditItemType(typeId)}>{L.editType}</button>}
          </label>}
          {TYPES_ENABLED && typeId && <p className={styles.hint}>{L.typeHint}</p>}

          <section className={styles.fields} aria-label={L.fields}>
            {fields.length === 0 && <p className={styles.hint}>{L.noFields}</p>}
            {fields.map(({ field, fromType }) => (
              <div key={field.id} className={styles.fieldRow} role="group" aria-label={field.name}>
                <div className={styles.fieldHead}>
                  <span className={styles.fieldName}>{field.name}</span>
                  {fromType && TYPES_ENABLED && <span className={styles.badge}>{L.fromType}</span>}
                  {!fromType && field.type !== 'period' && (
                    <label className={styles.inherit}>
                      <input type="checkbox" checked={!!field.inherit} onChange={(e) => updateOwnField(id, field.id, { inherit: e.target.checked })} /> {L.inherit}
                    </label>
                  )}
                  {!fromType && (
                    <button type="button" className={styles.iconBtn} aria-label={`${L.remove}: ${field.name}`} title={L.remove} onClick={() => void removeField(field.id, field.name, field.type === 'period')}>
                      <TrashIcon width="1em" height="1em" />
                    </button>
                  )}
                </div>
                {field.type === 'period'
                  ? <PeriodField id={id as CollectionId} exams={fromType || !!templateFor(c.templateId)?.dates.exams} />
                  : <FieldInput field={field} value={attributeValue(c, field)} onChange={(v) => setAttributeValue(id, field.id, v)} />}
              </div>
            ))}
            {!hasPeriodField(fields) && effectivePeriod(id, collections) && <PeriodField id={id as CollectionId} />}
          </section>

          {inherited.length > 0 && (
            <section className={styles.fields} aria-label={L.fromAbove}>
              <span className={styles.label}>{L.fromAbove}</span>
              {inherited.map(({ field, value, fromId }) => (
                <div key={field.id} className={styles.inheritedRow}>
                  <span className={styles.fieldName}>{field.name}</span>
                  <span>{field.type === 'period' ? '' : formatFieldValue(field, value)}</span>
                  <span className={styles.hint}>{L.from(collections[fromId as CollectionId]?.name ?? '')}</span>
                  <button type="button" className={styles.linkBtn} onClick={() => { addOwnField(id, { ...field }, field.id); setAttributeValue(id, field.id, value); }}>{L.setOwn}</button>
                </div>
              ))}
            </section>
          )}

          <form className={styles.addRow} onSubmit={addField}>
            <input className={styles.input} aria-label={L.newName} placeholder={L.newName} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className={styles.select} aria-label={L.newKind} value={newType} onChange={(e) => setNewType(e.target.value as FieldType)}>
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <button type="submit" className={styles.btn} disabled={!newName.trim()}>{L.addField}</button>
          </form>

          {TYPES_ENABLED && fields.length > 0 && (
            <form className={styles.addRow} onSubmit={saveAsType}>
              <input className={styles.input} aria-label={L.typeName} placeholder={L.typeName} value={typeName} onChange={(e) => setTypeName(e.target.value)} />
              <button type="submit" className={styles.btn} disabled={!typeName.trim()}>{L.saveAsType}</button>
            </form>
          )}
        </div>
        <div className={styles.footer}>
          <span className={styles.spacer} />
          <button type="button" className={styles.primary} onClick={closeModal}>{L.done}</button>
        </div>
      </div>
    </div>
  );
}

// "Teaching period 27 Jul – 6 Nov · Code GEOS215 · Edit details": in an Endeavour's edit panes.
export function AttributesSummary({ id }: { id: CollectionId }) {
  const collections = useTaskStore((s) => s.collections);
  const types = useItemTypeStore((s) => s.types);
  const show = useUIStore((s) => s.showEndeavourAttributes);
  const c = collections[id];
  if (!c) return null;
  const eff = effectivePeriod(id, collections);
  const parts = attributeFields(c, types).flatMap(({ field }) => {
    if (field.type === 'period') return eff && (eff.period.start || eff.period.end) ? [`${field.name} ${day(eff.period.start)} – ${day(eff.period.end)}`] : [];
    const v = attributeValue(c, field);
    return hasFieldValue(v) ? [`${field.name} ${formatFieldValue(field, v)}`] : [];
  });
  if (eff?.inherited && (eff.period.start || eff.period.end) && !hasPeriodField(attributeFields(c, types))) parts.unshift(L.periodFrom(collections[eff.from as CollectionId]?.name ?? '', `${day(eff.period.start)} – ${day(eff.period.end)}`));
  return (
    <div className={styles.summary} role="group" aria-label={L.summary}>
      <span className={styles.label}>{L.summary}</span>
      <span className={styles.summaryText}>{parts.length ? parts.join(' · ') : L.noneYet}</span>
      <button type="button" className={styles.linkBtn} onClick={() => show(id)}>{L.edit}</button>
    </div>
  );
}

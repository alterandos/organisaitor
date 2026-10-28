import { useId } from 'react';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { FieldInput } from '@/components/FieldInput/FieldInput';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { iconText } from '@/components/IconPicker/iconValue';
import { partDue, pickableTypes, resolveItemType } from '@/utils/itemTypes';
import { formatDate } from '@/utils/date';
import { setItemType, setItemTypeField, type TypedTarget } from '@/services/itemTypes';
import { LABELS } from '@/config/labels';
import type { ItemTypeId, TypedItem } from '@/types';
import styles from './ItemTypeField.module.css';

// An item's Type and its fields (docs/features/endeavours.md phase 3), the same in every form and
// pane that can type an item: ItemTypeField in a creation form (controlled; it also offers the
// Type's parts to make), ItemTypePaneField in an item pane (saves as it changes). Shows nothing
// while the person has no Types and the item has none, so it costs nobody who doesn't use them.

const L = LABELS.itemTypes;

interface FieldProps {
  typeId:        ItemTypeId | null;
  values:        Record<string, unknown>;
  onTypeChange:  (id: ItemTypeId | null) => void;
  onValueChange: (fieldId: string, value: unknown) => void;
  // A creation form: the Type's parts, ticked to be made with it, dated from `date`.
  parts?: { chosen: string[]; onChange: (ids: string[]) => void; date: string | null };
}

export function ItemTypeField({ typeId, values, onTypeChange, onValueChange, parts }: FieldProps) {
  const types = useItemTypeStore((s) => s.types);
  const id = useId();
  const options = pickableTypes(types, typeId);
  if (options.length === 0 && !typeId) return null;
  const resolved = resolveItemType(types, typeId);

  return (
    <div className={styles.typeField}>
      <div className={styles.pickRow}>
        <label className={styles.label} htmlFor={id}>{L.type}</label>
        {resolved && <ItemIcon icon={resolved.type.icon} className={styles.icon} />}
        <select id={id} className={styles.select} value={typeId ?? ''} onChange={(e) => onTypeChange((e.target.value || null) as ItemTypeId | null)}>
          <option value="">{L.none}</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>{[iconText(t.icon), t.name].filter(Boolean).join(' ')}</option>
          ))}
        </select>
      </div>

      {resolved && resolved.fields.length > 0 && (
        <div className={styles.fields}>
          {resolved.fields.map((f) => (
            <div key={f.id} className={styles.fieldRow}>
              {f.type !== 'boolean' && <span className={styles.fieldName}>{f.name}</span>}
              <div className={styles.fieldInput}>
                <FieldInput field={f} value={values[f.id]} onChange={(v) => onValueChange(f.id, v)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {parts && resolved && resolved.parts.length > 0 && (
        <fieldset className={styles.parts}>
          <legend className={styles.label}>{L.partsMade}</legend>
          {resolved.parts.map((p) => {
            const on = parts.chosen.includes(p.id);
            return (
              <label key={p.id} className={styles.part}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!parts.date}
                  onChange={() => parts.onChange(on ? parts.chosen.filter((x) => x !== p.id) : [...parts.chosen, p.id])}
                />
                <span>{p.title}</span>
                <span className={styles.when}>
                  {L.partWhen(p.kind, p.offsetDays)}
                  {parts.date && ` · ${formatDate(partDue(p, parts.date) + 'T00:00:00')}`}
                </span>
              </label>
            );
          })}
          {!parts.date && <p className={styles.hint}>{L.partsNeedDate}</p>}
        </fieldset>
      )}
    </div>
  );
}

// In an item's pane: reads the item's Type from its store and saves each change straight away.
export function ItemTypePaneField({ target }: { target: TypedTarget }) {
  const item = useTypedItem(target);
  if (!item) return null;
  return (
    <ItemTypeField
      typeId={item.typeId ?? null}
      values={item.typeFields ?? {}}
      onTypeChange={(id) => setItemType(target, id)}
      onValueChange={(fieldId, v) => setItemTypeField(target, fieldId, v)}
    />
  );
}

function useTypedItem(target: TypedTarget): TypedItem | undefined {
  const task  = useTaskStore((s) => (target.kind === 'task' ? s.tasks[target.id] : undefined));
  const event = useCalendarStore((s) => (target.kind === 'event' ? s.events[target.id] : target.kind === 'deadline' ? s.deadlines[target.id] : undefined));
  return task ?? event;
}

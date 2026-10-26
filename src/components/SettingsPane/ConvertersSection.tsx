import { LABELS } from '@/config/labels';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { useConverterStore } from '@/store/converterStore';
import { useUIStore } from '@/store/uiStore';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { EditIcon, TrashIcon } from '@/components/Icons';
import type { CustomConverter } from '@/types/converters';
import styles from './SettingsPane.module.css';

// Settings → Converters: the person's own converters, to look over and tidy. Editing and making
// one opens the converters panel's editor (components/ConverterPane/ConverterEditor), the one
// place converters are edited, so the two ways in can't drift apart.
export function ConvertersSection() {
  const L = LABELS.converters;
  const converters = useConverterStore((s) => s.converters);
  const open = useUIStore((s) => s.openConverters);
  const list = Object.values(converters).sort((a, b) => a.name.localeCompare(b.name));

  async function remove(c: CustomConverter) {
    // A saved converter always has a formula: never empty.
    if (await confirmDelete(L.noun, c.name, undefined, { empty: false })) useConverterStore.getState().deleteConverter(c.id);
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{L.settings.heading}</h3>
      <p className={styles.settingDesc}>{L.settings.hint}</p>
      {list.length === 0 ? <p className={styles.settingDesc}>{L.noneYet}</p> : (
        <ul className={styles.shortcutList}>
          {list.map((c) => (
            <li key={c.id} className={styles.shortcutRow}>
              <ItemIcon icon={c.icon} fallback="🧮" />
              <span className={styles.shortcutText}>{c.name}</span>
              <code className={styles.settingDesc}>{c.output.key} = {c.formula}</code>
              <button type="button" className={styles.shortcutRemove} onClick={() => open({ select: c.id, edit: c.id })} aria-label={`${L.edit} ${c.name}`} title={L.edit}><EditIcon /></button>
              <button type="button" className={styles.shortcutRemove} onClick={() => void remove(c)} aria-label={`${L.delete} ${c.name}`} title={L.delete}><TrashIcon /></button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={styles.shortcutAdd} onClick={() => open({ edit: 'new' })}>{L.newOne}</button>
    </section>
  );
}

import { useId, useState, type KeyboardEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { CloseIcon } from '@/components/Icons';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { tagByName, tagLabel } from '@/services/tags';
import { LABELS } from '@/config/labels';
import type { InheritedTag } from '@/utils/tagScope';
import type { TagId } from '@/types';
import styles from './TagField.module.css';

// THE way to choose the suite's tags, in every form and pane (2026-11-06): the chosen ones as chips,
// type to find one or make one (Enter or comma), and, greyed and fixed, the ones passed down from
// what it's part of ("from Semester 1"). A tag typed that doesn't exist is a draft until the host
// saves (services/tags.ts commitTags); a pane that saves as it goes commits in its onChange.

const L = LABELS.tagField;

interface Props {
  value:      readonly string[];
  onChange:   (ids: string[]) => void;
  inherited?: readonly InheritedTag[];
  fromName?:  (id: string) => string;     // what an inherited tag comes from
  label?:     string;
  hint?:      string;
  labelClassName?: string;   // the host form's own label style
  allowNew?:  boolean;       // false for a filter: only tags that exist
}

export function TagField({ value, onChange, inherited = [], fromName, label = L.label, hint, labelClassName, allowNew = true }: Props) {
  const tags = useTaskStore((s) => s.tags);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = useId();

  const shown = new Set([...value, ...inherited.map((t) => t.id)]);
  const q = text.trim().toLowerCase();
  const options = Object.values(tags)
    .filter((t) => !t.archivedAt && !shown.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
    .sort((a, b) => (q ? Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) : 0) || a.name.localeCompare(b.name))
    .slice(0, 8);
  const exact = q && Object.values(tags).some((t) => t.name.toLowerCase() === q);
  const offerNew = allowNew && !!q && !exact;
  const count = options.length + (offerNew ? 1 : 0);

  function add(id: string) {
    if (!value.includes(id) && !inherited.some((t) => t.id === id)) onChange([...value, id]);
    setText('');
    setActive(0);
  }

  function addTyped(name: string) {
    const n = name.trim();
    if (!n) return;
    if (allowNew) { add(tagByName(n)); return; }
    const found = Object.values(tags).find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (found) add(found.id); else setText('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && count) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % count); return; }
    if (e.key === 'ArrowUp' && count) { e.preventDefault(); setActive((a) => (a - 1 + count) % count); return; }
    if ((e.key === 'Enter' || e.key === ',') && (q || (open && options[active]))) {
      e.preventDefault();
      e.stopPropagation();
      if (open && active < options.length && options[active]) add(options[active].id); else addTyped(text);
      return;
    }
    if (e.key === 'Backspace' && !text && value.length) { onChange(value.slice(0, -1)); return; }
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={labelClassName ?? styles.label}>{label}</label>
      <div className={styles.box} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); document.getElementById(inputId)?.focus(); } }}>
        {inherited.map((t) => {
          const tag = tags[t.id as TagId];
          if (!tag) return null;
          const from = fromName?.(t.from) ?? '';
          return (
            <span key={`i-${t.id}`} className={`${styles.chip} ${styles.inherited}`} title={from ? L.from(from) : undefined}>
              {tag.icon && <ItemIcon icon={tag.icon} className={styles.icon} />}
              {tag.name}
              {from && <span className={styles.visuallyHidden}>{` (${L.from(from)})`}</span>}
            </span>
          );
        })}
        {value.map((id) => {
          const tag = tags[id as TagId];
          const name = tag?.name ?? tagLabel(id);
          if (!name) return null;
          return (
            <span key={id} className={styles.chip} style={tag?.color ? { borderColor: tag.color } : undefined}>
              {tag?.icon && <ItemIcon icon={tag.icon} className={styles.icon} />}
              {name}
              <button type="button" className={styles.remove} aria-label={L.remove(name)} onClick={() => onChange(value.filter((x) => x !== id))}>
                <CloseIcon width="0.85em" height="0.85em" />
              </button>
            </span>
          );
        })}
        <input
          id={inputId}
          className={styles.input}
          value={text}
          placeholder={value.length || inherited.length ? '' : L.placeholder}
          role="combobox"
          aria-expanded={open && count > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => { setText(e.target.value.replace(/,/g, '')); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); if (text.trim()) addTyped(text); }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && count > 0 && (
        <ul id={listId} className={styles.options} role="listbox" aria-label={label}>
          {options.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} className={`${styles.option} ${i === active ? styles.optionOn : ''}`}
                onMouseDown={(e) => { e.preventDefault(); add(t.id); }}>
                {t.icon ? <ItemIcon icon={t.icon} className={styles.icon} /> : <span className={styles.dot} style={t.color ? { background: t.color } : undefined} />}
                {t.name}
              </button>
            </li>
          ))}
          {offerNew && (
            <li role="option" aria-selected={active === options.length}>
              <button type="button" tabIndex={-1} className={`${styles.option} ${active === options.length ? styles.optionOn : ''}`}
                onMouseDown={(e) => { e.preventDefault(); addTyped(text); }}>
                {L.make(text.trim())}
              </button>
            </li>
          )}
        </ul>
      )}
      {inherited.length > 0 && fromName && <p className={styles.hint}>{L.fromLine([...new Set(inherited.map((t) => fromName(t.from)).filter(Boolean))].join(', '))}</p>}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

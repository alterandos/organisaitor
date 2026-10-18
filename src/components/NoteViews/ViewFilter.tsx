import { useRef, useState, type CSSProperties } from 'react';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { notesNav } from '@/services/notesNav';
import { isFilterEmpty, type NotesFilter } from '@/utils/notesBrowse';
import type { FilterOption } from '@/hooks/useNotesBrowse';
import styles from './NoteViews.module.css';
import { CloseIcon } from '@/components/Icons';

// The Notes views' filter: chips for what's chosen (each removable), and a Filter button opening the
// Endeavours, Purposes and tags to choose from. The filter is shared by every Notes view.

type Key = keyof NotesFilter;
const SECTIONS: { key: Key; option: 'endeavours' | 'purposes' | 'tags' }[] = [
  { key: 'collectionIds', option: 'endeavours' },
  { key: 'purposeIds', option: 'purposes' },
  { key: 'tagIds', option: 'tags' },
];

export function ViewFilter({ filter, options }: { filter: NotesFilter; options: Record<'endeavours' | 'purposes' | 'tags', FilterOption[]> }) {
  const L = LABELS.notesViews;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEscapeClose(() => setOpen(false), open);

  const toggle = (key: Key, id: string) => {
    const now = filter[key];
    notesNav.setFilter({ ...filter, [key]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] });
  };
  const chosen = SECTIONS.flatMap(({ key, option }) => filter[key]
    .map((id) => ({ key, id, opt: options[option].find((o) => o.id === id) }))
    .filter((c): c is { key: Key; id: string; opt: FilterOption } => !!c.opt));
  const nothing = SECTIONS.every(({ option }) => options[option].length === 0);

  return (
    <div
      ref={wrapRef}
      className={styles.filter}
      onBlur={(e) => { if (open && !wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      {chosen.map((c) => (
        <button key={`${c.key}:${c.id}`} type="button" className={styles.chip}
          style={c.opt.color ? ({ '--chip-color': c.opt.color } as CSSProperties) : undefined}
          aria-label={L.removeFilter(c.opt.label)} title={L.removeFilter(c.opt.label)} onClick={() => toggle(c.key, c.id)}>
          {c.opt.label} <CloseIcon aria-hidden="true" />
        </button>
      ))}
      <button type="button" className={styles.filterBtn} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {L.filter}{chosen.length > 0 ? ` (${chosen.length})` : ''} ▾
      </button>
      {open && (
        <div className={styles.filterPanel} role="group" aria-label={L.filterHint}>
          {nothing && <p className={styles.filterNone}>{L.noneToFilter}</p>}
          {SECTIONS.map(({ key, option }) => options[option].length > 0 && (
            <div key={key} className={styles.filterSection}>
              <div className={styles.filterHeading}>{L.filterSections[option]}</div>
              <div className={styles.filterChoices}>
                {options[option].map((o) => (
                  <button key={o.id} type="button" className={styles.choice} aria-pressed={filter[key].includes(o.id)}
                    style={o.color ? ({ '--chip-color': o.color } as CSSProperties) : undefined} onClick={() => toggle(key, o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!isFilterEmpty(filter) && (
            <button type="button" className={styles.clearBtn} onClick={() => notesNav.setFilter({ collectionIds: [], purposeIds: [], tagIds: [] })}>{L.clearFilter}</button>
          )}
        </div>
      )}
    </div>
  );
}

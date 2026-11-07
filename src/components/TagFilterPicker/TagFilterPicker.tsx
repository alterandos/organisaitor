import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { BottomSheet } from '@/components/BottomSheet/BottomSheet';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { TagIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { TagId } from '@/types';
import styles from './TagFilterPicker.module.css';

// The header's tag filter (2026-11-06), in every section the registry says (config/sections.ts
// `tagFilter`): one choice, shared by Tasks, Calendar, Records, Lists and Notes, read by each
// section through hooks/useTagFilter.ts, so a tag passed down from an Endeavour or notebook counts.
// Shown once there are tags. A panel placed by utils/floatingPlacement.ts; a sheet on Android.

const L = LABELS.tagFilter;

export function TagFilterPicker({ variant = 'dropdown' }: { variant?: 'dropdown' | 'sheet' }) {
  const tagsRecord = useTaskStore((s) => s.tags);
  const active = useUIStore((s) => s.activeTagIds);
  const toggle = useUIStore((s) => s.toggleTagFilter);
  const clear = useUIStore((s) => s.clearTagFilter);
  const open = useUIStore((s) => s.tagPickerOpen);
  const toggleOpen = useUIStore((s) => s.toggleTagPicker);
  const close = useUIStore((s) => s.closeTagPicker);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(open ? anchor : null, { align: 'end' });

  useEscapeClose(close, open && variant === 'dropdown');
  useEffect(() => {
    if (!open || variant !== 'dropdown') return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, variant, close, ref]);

  const tags = Object.values(tagsRecord)
    .filter((t) => !t.archivedAt || active.includes(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!tags.length) return null;

  const q = query.trim().toLowerCase();
  const shown = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  const chosen = active.map((id) => tagsRecord[id as TagId]).filter(Boolean);
  const label = chosen.length === 0 ? L.all : chosen.length === 1 ? chosen[0].name : L.some(chosen.length);

  function onTrigger() {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    setQuery('');
    toggleOpen();
  }

  const list = (
    <>
      {tags.length > 8 && (
        <input className={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={LABELS.tagField.placeholder} aria-label={L.title} autoFocus />
      )}
      <div className={styles.list} role="listbox" aria-multiselectable="true" aria-label={L.title}>
        {shown.map((t) => {
          const on = active.includes(t.id);
          return (
            <button key={t.id} type="button" role="option" aria-selected={on} className={`${styles.item} ${on ? styles.itemOn : ''}`} onClick={() => toggle(t.id)}>
              <span className={`${styles.check} ${on ? styles.checkOn : ''}`} aria-hidden>{on && '✓'}</span>
              {t.icon ? <ItemIcon icon={t.icon} className={styles.icon} /> : <span className={styles.dot} style={t.color ? { background: t.color } : undefined} />}
              <span className={styles.name}>{t.name}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.foot}>
        <span className={styles.hint}>{L.hint}</span>
        {active.length > 0 && <button type="button" className={styles.clear} onClick={clear}>{L.clear}</button>}
      </div>
    </>
  );

  return (
    <>
      <button ref={buttonRef} type="button" className={`${styles.trigger} ${active.length ? styles.triggerOn : ''}`} onClick={onTrigger}
        aria-expanded={open} aria-haspopup="listbox" aria-label={`${L.label}: ${label}`}>
        <TagIcon width="1em" height="1em" />
        {variant === 'dropdown' && <span className={active.length ? styles.chosen : styles.all}>{label}</span>}
      </button>
      {open && variant === 'sheet' && <BottomSheet onClose={close} title={L.title}>{list}</BottomSheet>}
      {open && variant === 'dropdown' && createPortal(
        <div ref={ref} className={styles.panel} style={style}>{list}</div>,
        document.body,
      )}
    </>
  );
}

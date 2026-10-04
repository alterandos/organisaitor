import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useOverviewStore } from '@/store/overviewStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { OVERVIEW_SOURCES } from '@/overview/sources';
import { DEFAULT_QUERY } from '@/overview/engine';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import type {
  OverviewGroupBy, OverviewId, OverviewQuery, OverviewSort, OverviewSourceKey, OverviewStatusFilter, OverviewWhenFilter,
} from '@/types/overview';
import styles from './AddOverviewModal.module.css';

const L = LABELS.overview;

// Create or edit a saved Overview: what to include (sources), which Endeavour, open vs all, which
// dates, a title search, sort and grouping. App.tsx mounts it keyed by the Overview being edited.
export function AddOverviewModal() {
  const closeModal      = useUIStore((s) => s.closeModal);
  const setSelection    = useUIStore((s) => s.setOverviewSelection);
  const editingId       = useUIStore((s) => s.editingOverviewId);
  const addOverview     = useOverviewStore((s) => s.addOverview);
  const updateOverview  = useOverviewStore((s) => s.updateOverview);
  const collections     = useTaskStore((s) => s.collections);
  const editing = useOverviewStore((s) => (editingId ? s.overviews[editingId as OverviewId] : undefined));

  const start: OverviewQuery = editing ?? DEFAULT_QUERY;
  const [name, setName]         = useState(() => editing?.name ?? '');
  const [icon, setIcon]         = useState(() => editing?.icon ?? '');
  const [sources, setSources]   = useState<OverviewSourceKey[]>(() => start.sources);
  const [collectionId, setCollectionId] = useState<CollectionId | null>(() => start.collectionId);
  const [status, setStatus]     = useState<OverviewStatusFilter>(() => start.status);
  const [when, setWhen]         = useState<OverviewWhenFilter>(() => start.when);
  const [windowDays, setWindowDays] = useState(() => (start.windowDays == null ? '' : String(start.windowDays)));
  const [search, setSearch]     = useState(() => start.search);
  const [sort, setSort]         = useState<OverviewSort>(() => start.sort);
  const [groupBy, setGroupBy]   = useState<OverviewGroupBy>(() => start.groupBy);
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const toggleSource = (k: OverviewSourceKey) =>
    setSources((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const days = windowDays.trim() === '' ? null : Math.max(0, Math.round(Number(windowDays)));
    const query: OverviewQuery = {
      sources, collectionId, status, when,
      windowDays: when === 'upcoming' || when === 'past' ? (Number.isFinite(days) ? days : null) : null,
      search: search.trim(), sort, groupBy,
    };
    if (editing) {
      updateOverview(editing.id, { ...query, name: name.trim(), icon: icon.trim() || null });
    } else {
      const id = addOverview({ ...query, name, icon: icon.trim() || null });
      setSelection({ kind: 'saved', id });
    }
    closeModal();
  }

  const endeavourOptions = Object.values(collections).filter((c) => c.kind === 'project' || c.kind === 'list');

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-label={editing ? L.editTitle : L.newTitle}>
        <div className={styles.header}>
          <span className={styles.title}>{editing ? L.editTitle : L.newTitle}</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{L.name}</label>
            <div className={styles.nameRow}>
              <input
                className={`${styles.input} ${styles.iconInput}`}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📊"
                maxLength={4}
                aria-label="Icon"
              />
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={L.namePlaceholder}
                autoFocus
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{L.sourcesLabel}</label>
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${sources.length === 0 ? styles.chipActive : ''}`}
                onClick={() => setSources([])}
              >{L.sourcesAll}</button>
              {OVERVIEW_SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`${styles.chip} ${sources.includes(s.key) ? styles.chipActive : ''}`}
                  onClick={() => toggleSource(s.key)}
                >{s.icon} {s.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{L.endeavourLabel}</label>
            <CollectionPicker
              collections={endeavourOptions}
              value={collectionId}
              onChange={setCollectionId}
              noneLabel={L.anyEndeavour}
            />
          </div>

          <div className={`${styles.field} ${styles.row2}`}>
            <div>
              <label className={styles.fieldLabel}>{L.statusLabel}</label>
              <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as OverviewStatusFilter)}>
                {(Object.keys(L.statusFilter) as OverviewStatusFilter[]).map((k) => <option key={k} value={k}>{L.statusFilter[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel}>{L.whenLabel}</label>
              <select className={styles.select} value={when} onChange={(e) => setWhen(e.target.value as OverviewWhenFilter)}>
                {(Object.keys(L.whenFilter) as OverviewWhenFilter[]).map((k) => <option key={k} value={k}>{L.whenFilter[k]}</option>)}
              </select>
            </div>
          </div>

          {(when === 'upcoming' || when === 'past') && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{L.windowLabel}</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                placeholder="∞"
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{L.searchLabel}</label>
            <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className={`${styles.field} ${styles.row2}`}>
            <div>
              <label className={styles.fieldLabel}>{L.sortLabel}</label>
              <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as OverviewSort)}>
                {(Object.keys(L.sort) as OverviewSort[]).map((k) => <option key={k} value={k}>{L.sort[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel}>{L.groupLabel}</label>
              <select className={styles.select} value={groupBy} onChange={(e) => setGroupBy(e.target.value as OverviewGroupBy)}>
                {(Object.keys(L.groupBy) as OverviewGroupBy[]).map((k) => <option key={k} value={k}>{L.groupBy[k]}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>
              {editing ? L.save : L.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { LABELS } from '@/config/labels';
import { ENDEAVOUR_LINK_KINDS } from '@/config/endeavourLinkKinds';
import { canAddEndeavourLink, childrenOf, type EndeavourLinkRefusal } from '@/utils/endeavourGraph';
import { CloseIcon } from '@/components/Icons';
import type { CollectionId, EndeavourLinkKind } from '@/types';
import styles from './EndeavourLinksField.module.css';

interface Props {
  kind:     EndeavourLinkKind;
  // The Endeavour being edited, or null while it's being created (then `value` / `onChange` hold the
  // picks until it exists).
  selfId:   CollectionId | null;
  value?:   CollectionId[];
  onChange?: (ids: CollectionId[]) => void;
}

const L = LABELS.endeavourLinks;

function refusalText(r: EndeavourLinkRefusal, targetName: string): string {
  return r === 'loop' ? L.refused.loop(targetName) : L.refused[r];
}

// "Part of" / "Related to" in the Endeavour editor (docs/features/endeavours.md). Editing an existing
// Endeavour, each change applies at once through the store (which refuses loops); creating one, the
// picks are held and made once it exists. Only ongoing and finishable Endeavours are offered (not
// trackers or routines, which keep their own "filed under").
export function EndeavourLinksField({ kind, selfId, value, onChange }: Props) {
  const collections = useTaskStore((s) => s.collections);
  const addLink    = useTaskStore((s) => s.addEndeavourLink);
  const removeLink = useTaskStore((s) => s.removeEndeavourLink);
  const [refused, setRefused] = useState<string | null>(null);
  const def = ENDEAVOUR_LINK_KINDS[kind];

  const self = selfId ? collections[selfId] : undefined;
  const linked: CollectionId[] = self
    ? [
      ...(self.links ?? []).filter((l) => l.kind === kind && collections[l.targetId]).map((l) => l.targetId),
      ...(def.symmetric
        ? Object.values(collections).filter((c) => c.id !== self.id && c.links?.some((l) => l.kind === kind && l.targetId === self.id)).map((c) => c.id)
        : []),
    ]
    : value ?? [];

  const candidates = Object.values(collections)
    .filter((c) => (c.kind === 'project' || c.kind === 'list') && !c.archivedAt && c.id !== selfId && !linked.includes(c.id))
    .filter((c) => !selfId || canAddEndeavourLink(collections, selfId, kind, c.id) === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  function add(id: CollectionId) {
    setRefused(null);
    if (!selfId) { onChange?.([...linked, id]); return; }
    const r = addLink(selfId, kind, id);
    if (r) setRefused(refusalText(r, collections[id]?.name ?? ''));
  }

  function remove(id: CollectionId) {
    setRefused(null);
    if (!selfId) { onChange?.(linked.filter((x) => x !== id)); return; }
    removeLink(selfId, kind, id);
  }

  const contains = kind === 'partOf' && selfId
    ? childrenOf(selfId, collections).filter((id) => {
      const c = collections[id];
      return c && (c.kind === 'project' || c.kind === 'list');
    })
    : [];
  const fieldId = `endeavour-${kind}`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>{def.label}</label>
      <div className={styles.chips}>
        {linked.map((id) => (
          <span key={id} className={styles.chip}>
            {collections[id]?.name}
            <button type="button" className={styles.remove} onClick={() => remove(id)} aria-label={L.remove(collections[id]?.name ?? '')} title={L.remove(collections[id]?.name ?? '')}>
              <CloseIcon width="0.9em" height="0.9em" />
            </button>
          </span>
        ))}
        {candidates.length > 0 && (
          <select
            id={fieldId}
            className={styles.add}
            value=""
            onChange={(e) => { if (e.target.value) add(e.target.value as CollectionId); }}
          >
            <option value="">{L.add}</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {linked.length === 0 && candidates.length === 0 && <span className={styles.none}>{L.none}</span>}
      </div>
      <p className={styles.hint}>{kind === 'partOf' ? L.hintPartOf : L.hintRelated}</p>
      {refused && <p className={styles.refused} role="alert">{refused}</p>}
      {contains.length > 0 && (
        <p className={styles.hint}>{L.contains}: {contains.map((id) => collections[id]?.name).join(', ')}</p>
      )}
    </div>
  );
}

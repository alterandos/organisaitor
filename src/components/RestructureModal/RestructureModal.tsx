import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { CloseIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { filedIcon, filedUnder, type FiledItem, type FiledKind } from '@/services/endeavourFiling';
import { ALL_SHAPE, copyShape, mergeEndeavour, splitEndeavour, type ShapeOptions } from '@/services/endeavourRestructure';
import { endeavourSubtree } from '@/utils/endeavourGraph';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import styles from './RestructureModal.module.css';

// Changing your mind about an Endeavour (docs/features/endeavours.md phase 6): copy its shape,
// split a part off it, or merge it into another. Each is one action with Undo in the toast; what
// moves comes from services/endeavourFiling.ts, so every app's things are covered.

const L = LABELS.restructure;
type Mode = 'copy' | 'split' | 'merge';
const MODES: Mode[] = ['copy', 'split', 'merge'];
const MODE_LABEL: Record<Mode, string> = { copy: L.copyShape, split: L.split, merge: L.merge };
const SHAPE_KEYS: (keyof ShapeOptions)[] = ['parts', 'notebooks', 'lists', 'timetables', 'records', 'goals'];
const SHAPE_LABEL: Record<keyof ShapeOptions, string> = {
  parts: L.copyParts, notebooks: L.copyNotebooks, lists: L.copyLists, timetables: L.copyTimetables, records: L.copyRecords, goals: L.copyGoals,
};

export function RestructureModal() {
  const closeModal = useUIStore((s) => s.closeModal);
  const id = useUIStore((s) => s.restructureId) as CollectionId;
  const collections = useTaskStore((s) => s.collections);
  const source = collections[id];
  const [mode, setMode] = useState<Mode>(() => useUIStore.getState().restructureMode);
  const [name, setName] = useState(() => (source ? `${source.name}${L.copySuffix}` : ''));
  const [splitName, setSplitName] = useState('');
  const [shape, setShape] = useState<ShapeOptions>(ALL_SHAPE);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [into, setInto] = useState<CollectionId | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  // eslint-disable-next-line react-hooks/exhaustive-deps -- what's filed under it, read when the modal opens and as it changes
  const filed = useMemo(() => filedUnder(id), [id, collections]);
  const keyOf = (i: FiledItem) => `${i.kind}:${i.id}`;
  const groups = useMemo(() => {
    const out = new Map<FiledKind, FiledItem[]>();
    for (const i of filed) out.set(i.kind, [...(out.get(i.kind) ?? []), i]);
    return [...out.entries()];
  }, [filed]);
  const targets = useMemo(() => {
    const inside = endeavourSubtree(id, collections);
    return Object.values(collections).filter((c) => (c.kind === 'project' || c.kind === 'list') && !c.archivedAt && !inside.has(c.id));
  }, [id, collections]);

  if (!source) return null;
  const ready = mode === 'copy' ? !!name.trim() : mode === 'split' ? !!splitName.trim() && picked.size > 0 : !!into;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const ui = useUIStore.getState();
    if (mode === 'copy') {
      const r = copyShape(id, name, shape);
      closeModal(); ui.openEndeavourHome(r.id);
      showToast({ message: L.copied(name.trim(), r.made), actions: [{ label: L.undo, onClick: r.undo }] });
    } else if (mode === 'split') {
      const items = filed.filter((i) => picked.has(keyOf(i)));
      const r = splitEndeavour(id, splitName, items);
      closeModal(); ui.openEndeavourHome(r.id);
      showToast({ message: L.split_(splitName.trim(), items.length), actions: [{ label: L.undo, onClick: r.undo }] });
    } else if (into) {
      const r = mergeEndeavour(id, into);
      if (typeof r === 'string') return;
      const intoName = collections[into].name;
      closeModal(); ui.openEndeavourHome(into);
      showToast({ message: L.merged(source.name, intoName), actions: [{ label: L.undo, onClick: () => { r.undo(); useUIStore.getState().openEndeavourHome(id); } }] });
    }
  }

  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="rs-title">
        <div className={styles.header}>
          <span id="rs-title" className={styles.title}>{L.menu}: {source.name}</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={L.cancel}><CloseIcon /></button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.body}>
            <div className={styles.days} role="group" aria-label={L.menu}>
              {MODES.map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} className={`${styles.day} ${mode === m ? styles.dayOn : ''}`} onClick={() => setMode(m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            {mode === 'copy' && (
              <>
                <p className={styles.hint}>{L.copyHint}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{L.copyName}</span>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </label>
                <fieldset className={styles.section}>
                  <legend className={styles.label}>{L.copyWhat}</legend>
                  {SHAPE_KEYS.map((k) => (
                    <label key={k} className={styles.check}>
                      <input type="checkbox" checked={shape[k]} onChange={(e) => setShape({ ...shape, [k]: e.target.checked })} /> {SHAPE_LABEL[k]}
                    </label>
                  ))}
                </fieldset>
              </>
            )}

            {mode === 'split' && (
              <>
                <p className={styles.hint}>{L.splitHint}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{L.splitName}</span>
                  <input className={styles.input} value={splitName} placeholder={L.splitNamePlaceholder} onChange={(e) => setSplitName(e.target.value)} autoFocus />
                </label>
                {groups.length === 0 ? <p className={styles.hint}>{L.nothing}</p> : groups.map(([kind, items]) => (
                  <fieldset key={kind} className={styles.section}>
                    <legend className={styles.label}>{filedIcon(kind)} {L.kinds[kind]}</legend>
                    {items.map((i) => (
                      <label key={keyOf(i)} className={styles.check}>
                        <input type="checkbox" checked={picked.has(keyOf(i))} onChange={() => toggle(keyOf(i))} /> {i.title}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </>
            )}

            {mode === 'merge' && (
              <>
                <p className={styles.hint}>{L.mergeHint(source.name)}</p>
                <div className={styles.field}>
                  <span className={styles.label}>{L.mergeInto}</span>
                  <CollectionPicker collections={targets} value={into} onChange={setInto} noneLabel={`— ${LABELS.collection} —`} />
                </div>
                {filed.length === 0 ? <p className={styles.hint}>{L.mergeNothing}</p> : (
                  <ul className={styles.previewList}>
                    {groups.map(([kind, items]) => <li key={kind}>{filedIcon(kind)} {L.kinds[kind]}: {items.length}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className={styles.actions}>
            <span className={styles.spacer} />
            <button type="button" className={styles.secondaryBtn} onClick={closeModal}>{L.cancel}</button>
            <button type="submit" className={mode === 'merge' ? styles.dangerBtn : styles.submitBtn} disabled={!ready}>
              {mode === 'copy' ? L.copyDo : mode === 'split' ? L.splitDo : L.mergeDo}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

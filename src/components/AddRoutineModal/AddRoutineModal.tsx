import { commitTags } from '@/services/tags';
import { useState, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { RoutineTask, CollectionId } from '@/types';
import styles from './AddRoutineModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon } from '@/components/Icons';
import { RecordCommonFields, RoutineFields, type RecordCommon } from '@/components/RecordFields/RecordFields';
import { routineRepeat } from '@/utils/routineRepeat';

// A new routine: the same fields as its edit pane (components/RecordFields, "Creating and editing a
// thing is one form"; 2026-11-07, it hid most of them under "Advanced options").
export function AddRoutineModal() {
  const addCollection = useTaskStore((s) => s.addCollection);
  const closeModal    = useUIStore((s) => s.closeModal);
  const openModal     = useUIStore((s) => s.openModal);
  const [common, setCommon] = useState<RecordCommon>(() => ({
    name: useUIStore.getState().createDraft ?? '', color: null, purposeIds: [], tagIds: [],
    collectionId: selectActiveCollectionId(useUIStore.getState()) as CollectionId | null,
  }));
  const [steps, setSteps] = useState<RoutineTask[]>([]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);   // empty = every day
  const formRef = useRef<HTMLFormElement>(null);
  const isVisible = openModal === 'add-routine';

  useEscapeClose(() => { closeModal(); }, isVisible);
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit(), isVisible);

  if (!isVisible) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!common.name.trim()) return;
    addCollection({
      kind: 'routine', name: common.name.trim(), color: common.color, purposeIds: common.purposeIds, tagIds: commitTags(common.tagIds),
      collectionId: common.collectionId, routineTasks: steps, repeatConfig: routineRepeat(daysOfWeek),
    });
    closeModal();
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={LABELS.recordModals.newRoutine}>
        <div className={styles.header}>
          <span className={styles.title}>{LABELS.recordModals.newRoutine}</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={LABELS.recordModals.close}><CloseIcon /></button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit}>
          <RecordCommonFields value={common} onChange={(patch) => setCommon((c) => ({ ...c, ...patch }))} nameId="ar-name" namePlaceholder={LABELS.recordFields.routinePlaceholder} autoFocus />
          <RoutineFields steps={steps} onSteps={setSteps} daysOfWeek={daysOfWeek} onDays={setDaysOfWeek} />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>{LABELS.recordModals.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!common.name.trim()}>{LABELS.recordModals.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

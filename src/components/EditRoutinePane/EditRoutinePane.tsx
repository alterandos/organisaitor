import { commitTags } from '@/services/tags';
import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useRoutineStore } from '@/store/routineStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { RoutineTask, CollectionId } from '@/types';
import styles from './EditRoutinePane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon } from '@/components/Icons';
import { RecordCommonFields, RoutineFields, type RecordCommon } from '@/components/RecordFields/RecordFields';
import { routineRepeat } from '@/utils/routineRepeat';

// A routine's edit pane: the same fields as a new one (components/RecordFields, "Creating and
// editing a thing is one form"). App.tsx remounts it per routine (key), so these initialise from it.
export function EditRoutinePane() {
  const paneResize = usePaneWidth('record-pane', { edge: 'left', min: 340, max: 820 });
  const collections      = useTaskStore((s) => s.collections);
  const updateCollection = useTaskStore((s) => s.updateCollection);
  const deleteCollection = useTaskStore((s) => s.deleteCollection);
  const deleteInstances  = useRoutineStore((s) => s.deleteInstancesForRoutine);
  const editRoutineOpen  = useUIStore((s) => s.editRoutineOpen);
  const editingRoutineId = useUIStore((s) => s.editingRoutineId);
  const closeEditRoutine = useUIStore((s) => s.closeEditRoutine);
  const activeRoutineId  = useUIStore((s) => s.activeRoutineId);
  const setActiveRoutine = useUIStore((s) => s.setActiveRoutine);
  const routine = editingRoutineId ? (collections[editingRoutineId as CollectionId] ?? null) : null;

  const [common, setCommon] = useState<RecordCommon>(() => ({
    name: routine?.name ?? '', color: routine?.color ?? null, purposeIds: routine?.purposeIds ?? [],
    tagIds: routine?.tagIds ?? [], collectionId: routine?.collectionId ?? null,
  }));
  const [steps, setSteps] = useState<RoutineTask[]>(() => routine?.routineTasks ?? []);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(() => routine?.repeatConfig?.daysOfWeek ?? []);

  useEscapeClose(closeEditRoutine, editRoutineOpen);
  useCtrlEnterSubmit(() => handleSave(), editRoutineOpen && !!routine);

  if (!editRoutineOpen || !routine) return null;

  function handleSave() {
    if (!common.name.trim() || !routine) return;
    updateCollection(routine.id, {
      name: common.name.trim(), color: common.color, purposeIds: common.purposeIds, tagIds: commitTags(common.tagIds),
      collectionId: common.collectionId, routineTasks: steps, repeatConfig: routineRepeat(daysOfWeek),
    });
    closeEditRoutine();
  }

  async function handleDelete() {
    if (!routine) return;
    // No steps and no history: nothing goes with it.
    const hasHistory = Object.values(useRoutineStore.getState().instances).some((i) => i.routineId === routine.id);
    if (!(await confirmDelete('routine', routine.name, LABELS.recordModals.routineDeleteDetail, { empty: routine.routineTasks.length === 0 && !hasHistory }))) return;
    deleteInstances(routine.id as CollectionId);
    deleteCollection(routine.id as CollectionId);
    if (activeRoutineId === routine.id) setActiveRoutine(null);
    closeEditRoutine();
  }

  return (
    <>
      <div className={styles.overlay} onClick={closeEditRoutine} />
      <aside style={paneResize.style} className={styles.pane} role="complementary" aria-label={LABELS.recordModals.editRoutine}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <div className={styles.header}>
          <span className={styles.heading}>{LABELS.recordModals.editRoutine}</span>
          <button className={styles.closeBtn} onClick={closeEditRoutine} aria-label={LABELS.recordModals.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <RecordCommonFields value={common} onChange={(patch) => setCommon((c) => ({ ...c, ...patch }))} nameId="erp-name" namePlaceholder={LABELS.recordFields.routinePlaceholder} />
          <RoutineFields steps={steps} onSteps={setSteps} daysOfWeek={daysOfWeek} onDays={setDaysOfWeek} />
        </div>
        <div className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>{LABELS.recordModals.deleteRoutine}</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!common.name.trim()}>{LABELS.recordModals.save}</button>
        </div>
      </aside>
    </>
  );
}

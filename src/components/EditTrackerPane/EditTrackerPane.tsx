import { commitTags } from '@/services/tags';
import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { CollectionId, FieldSchema } from '@/types';
import styles from './EditTrackerPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon } from '@/components/Icons';
import { RecordCommonFields, TrackerFields, type RecordCommon } from '@/components/RecordFields/RecordFields';

// A tracker's edit pane: the same fields as a new one (components/RecordFields, "Creating and
// editing a thing is one form"). App.tsx remounts it per tracker (key), so these initialise from it.
export function EditTrackerPane() {
  const paneResize = usePaneWidth('record-pane', { edge: 'left', min: 340, max: 820 });
  const collections      = useTaskStore((s) => s.collections);
  const updateCollection = useTaskStore((s) => s.updateCollection);
  const editTrackerOpen  = useUIStore((s) => s.editTrackerOpen);
  const editingTrackerId = useUIStore((s) => s.editingTrackerId);
  const closeEditTracker = useUIStore((s) => s.closeEditTracker);
  const tracker = editingTrackerId ? (collections[editingTrackerId as CollectionId] ?? null) : null;

  const [common, setCommon] = useState<RecordCommon>(() => ({
    name: tracker?.name ?? '', color: tracker?.color ?? null, purposeIds: tracker?.purposeIds ?? [],
    tagIds: tracker?.tagIds ?? [], collectionId: tracker?.collectionId ?? null,
  }));
  const [fields, setFields] = useState<FieldSchema[]>(() => tracker?.fieldSchema ?? []);

  useEscapeClose(closeEditTracker, editTrackerOpen);
  useCtrlEnterSubmit(() => handleSave(), editTrackerOpen && !!tracker);

  if (!editTrackerOpen || !tracker) return null;

  // A column holding data in any entry asks before it's removed.
  const hasData = (fieldId: string) => Object.values(useTrackerStore.getState().entries).some(
    (e) => e.trackerId === tracker.id && e.data[fieldId] !== undefined && e.data[fieldId] !== null && e.data[fieldId] !== '');

  function handleSave() {
    if (!common.name.trim() || !tracker) return;
    updateCollection(tracker.id, {
      name: common.name.trim(), color: common.color, purposeIds: common.purposeIds, tagIds: commitTags(common.tagIds),
      collectionId: common.collectionId, fieldSchema: fields,
    });
    closeEditTracker();
  }

  return (
    <>
      <div className={styles.overlay} onClick={closeEditTracker} />
      <aside style={paneResize.style} className={styles.pane} role="complementary" aria-label={LABELS.recordModals.editTracker}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <div className={styles.header}>
          <span className={styles.heading}>{LABELS.recordModals.editTracker}</span>
          <button className={styles.closeBtn} onClick={closeEditTracker} aria-label={LABELS.recordModals.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <RecordCommonFields value={common} onChange={(patch) => setCommon((c) => ({ ...c, ...patch }))} nameId="etp-name" namePlaceholder={LABELS.recordFields.trackerPlaceholder} />
          <TrackerFields fields={fields} onFields={setFields} hasData={hasData} />
        </div>
        <div className={styles.footer}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!common.name.trim()}>{LABELS.recordModals.save}</button>
        </div>
      </aside>
    </>
  );
}

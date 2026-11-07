import { commitTags } from '@/services/tags';
import { useState, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { TRACKER_TEMPLATES } from '@/config/trackerTemplates';
import { LABELS } from '@/config/labels';
import type { TrackerTemplate, CollectionId, FieldSchema } from '@/types';
import styles from './AddTrackerModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon } from '@/components/Icons';
import { RecordCommonFields, TrackerFields, type RecordCommon } from '@/components/RecordFields/RecordFields';

// A new tracker: the same fields as its edit pane (components/RecordFields, "Creating and editing a
// thing is one form"), plus the template it starts from, which fills in its fields (changeable here).
export function AddTrackerModal() {
  const addCollection    = useTaskStore((s) => s.addCollection);
  const setActiveTracker = useUIStore((s) => s.setActiveTracker);
  const closeModal       = useUIStore((s) => s.closeModal);
  const [common, setCommon] = useState<RecordCommon>(() => ({
    name: useUIStore.getState().createDraft ?? '', color: null, purposeIds: [], tagIds: [],
    collectionId: selectActiveCollectionId(useUIStore.getState()) as CollectionId | null,
  }));
  const [template, setTemplate] = useState<TrackerTemplate>('habit');
  const [fields, setFields] = useState<FieldSchema[]>(() => TRACKER_TEMPLATES.habit.fields);
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(() => { closeModal(); });
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = common.name.trim();
    if (!trimmed) return;
    const id = addCollection({
      kind: 'tracker', name: trimmed, color: common.color, purposeIds: common.purposeIds, tagIds: commitTags(common.tagIds),
      fieldSchema: fields, template, collectionId: common.collectionId,
    });
    if (id) setActiveTracker(id);
    closeModal();
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={LABELS.recordModals.newTracker}>
        <div className={styles.header}>
          <span className={styles.title}>{LABELS.recordModals.newTracker}</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={LABELS.recordModals.close}><CloseIcon /></button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit}>
          <RecordCommonFields value={common} onChange={(patch) => setCommon((c) => ({ ...c, ...patch }))} nameId="atm-name" namePlaceholder={LABELS.recordFields.trackerPlaceholder} autoFocus />
          <TrackerFields fields={fields} onFields={setFields} template={template} onTemplate={(t) => { setTemplate(t); setFields(TRACKER_TEMPLATES[t].fields); }} />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>{LABELS.recordModals.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!common.name.trim()}>{LABELS.recordModals.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

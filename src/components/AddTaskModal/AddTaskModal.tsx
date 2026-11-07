import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { commitTags } from '@/services/tags';
import { makeItemLink } from '@/utils/taskLinks';
import { eventTarget, linkTaskToEvent, linkedTaskDates } from '@/services/eventTaskLinks';
import { type CalendarItemPick } from '@/components/CalendarItemPickerModal/CalendarItemPickerModal';
import { TaskCalendarLinks } from '@/components/TaskLinks/TaskCalendarLinks';
import { now, todayIso } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CollectionId, TaskId, CrossAppRef, ItemTypeId, PurposeId } from '@/types';
import { ItemTypeField } from '@/components/ItemTypeField/ItemTypeField';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { resolveItemType } from '@/utils/itemTypes';
import { applyItemType } from '@/services/itemTypes';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import styles from './AddTaskModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon } from '@/components/Icons';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { TaskFields, type TaskValues } from '@/components/TaskFields/TaskFields';

const L = LABELS.taskFields;

// A new task: the same fields as its pane (components/TaskFields, "Creating and editing a thing is
// one form"), then its parent. Made on Add, with whatever links were chosen.
export function AddTaskModal() {
  const taskModalAdvanced  = useUIStore((s) => s.taskModalAdvanced);
  const pendingParentId    = useUIStore((s) => s.pendingParentId);
  const pendingFollowUpOf  = useUIStore((s) => s.pendingFollowUpOf);
  const pendingEventLink   = useUIStore((s) => s.pendingEventLink);
  const quickAddPrefill    = useUIStore((s) => s.quickAddPrefill);
  const closeModal         = useUIStore((s) => s.closeModal);
  const tasksRecord        = useTaskStore((s) => s.tasks);

  // Abandoning the modal without making the task drops a pending Notes "Create ▸ Task" link
  // request, or a later, unrelated task could pick it up. The success path resolves it instead.
  const handleClose = () => {
    if (useUIStore.getState().pendingArtifactLink) useUIStore.getState().clearPendingArtifactLink();
    closeModal();
  };

  // A follow-up of an event shows its start, which sits among the less-used fields.
  const [advanced, setAdvanced] = useState(taskModalAdvanced || !!pendingParentId || pendingEventLink?.kind === 'followUpOf');
  const [prevAdvanced, setPrevAdvanced] = useState(taskModalAdvanced);
  if (prevAdvanced !== taskModalAdvanced) { setPrevAdvanced(taskModalAdvanced); setAdvanced(taskModalAdvanced); }
  const formRef = useRef<HTMLFormElement>(null);

  // Preparation for, or a follow-up of, an event or a Deadline: its dates, title and Endeavour.
  const eventItem  = pendingEventLink ? eventTarget(pendingEventLink.targetType, pendingEventLink.targetId) : undefined;
  // A sub-task starts with its parent's priority, Endeavour, tags and purposes; a follow-up with
  // those of the task it came from, but not its priority. The person's own picks win (*touched*).
  const parentTaskInitial = pendingParentId ? useTaskStore.getState().tasks[pendingParentId as TaskId] : undefined;
  const followUpOrigin = pendingFollowUpOf ? useTaskStore.getState().tasks[pendingFollowUpOf as TaskId] : undefined;
  const seedTask = parentTaskInitial ?? followUpOrigin;

  // A Type (Types are switched off: config/features.ts): its fields, parts and defaults.
  const [typeId, setTypeId] = useState<ItemTypeId | null>(() => useUIStore.getState().pendingItemTypeId);
  const [typeValues, setTypeValues] = useState<Record<string, unknown>>({});
  const initialType = resolveItemType(useItemTypeStore.getState().types, typeId);
  const [typeParts, setTypeParts] = useState<string[]>(() => initialType?.parts.map((p) => p.id) ?? []);
  const typeName = useItemTypeStore((st) => (typeId ? st.types[typeId]?.name : undefined));

  const [draft, setDraft] = useState<TaskValues>(() => {
    const eventDates = pendingEventLink && eventItem ? linkedTaskDates(pendingEventLink.kind, pendingEventLink.targetType, pendingEventLink.targetId, pendingEventLink.occurrence ?? null) : {};
    const eventTitle = eventItem ? (pendingEventLink!.kind === 'prepFor' ? LABELS.taskLinks.event.prepTitle : LABELS.taskLinks.event.followTitle)(eventItem.title) : '';
    return {
      title: quickAddPrefill?.title ?? eventTitle,
      notes: null,
      deadline: quickAddPrefill?.deadline ?? eventDates.deadline ?? null,
      deadlineTime: quickAddPrefill?.deadlineTime ?? eventDates.deadlineTime ?? null,
      scheduledAt: eventDates.scheduledAt ?? null,
      scheduledTime: null,
      priority: quickAddPrefill?.priority ?? parentTaskInitial?.priority ?? (initialType?.defaults.important ? 'high' : 'none'),
      timeIntensity: null,
      kind: 'action',
      collectionId: (quickAddPrefill?.collectionId ?? (seedTask ? seedTask.collectionId : eventItem?.collectionId ?? selectActiveCollectionId(useUIStore.getState()))) as CollectionId | null ?? null,
      purposeIds: (seedTask?.purposeIds ?? []) as PurposeId[],
      tagIds: [...new Set([...(seedTask?.tagIds ?? []), ...(initialType?.defaults.tagIds ?? [])])].filter((id) => useTaskStore.getState().tags[id]),
      links: quickAddPrefill?.links ?? [],
      repeat: null,
      parentId: pendingParentId ?? null,
    };
  });
  const touched = useRef(new Set<keyof TaskValues>(quickAddPrefill?.priority !== undefined ? ['priority'] : []));
  const update = (patch: Partial<TaskValues>) => {
    for (const k of Object.keys(patch) as (keyof TaskValues)[]) touched.current.add(k);
    setDraft((d) => ({ ...d, ...patch }));
  };

  // Linked items, held until the task is made: notes and lists picked by hand (the automatic
  // "created from this note" link is added at submit), and calendar items.
  const [manualCrossAppRefs, setManualCrossAppRefs] = useState<CrossAppRef[]>([]);
  const [calendarLinks, setCalendarLinks] = useState<CalendarItemPick[]>([]);
  const [pickingCalendar, setPickingCalendar] = useState(false);

  const topLevelTasks = Object.values(tasksRecord).filter((t) => !t.parentId && !t.completed && !t.archived);

  useEscapeClose(() => { handleClose(); });
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  const pickType = (id: ItemTypeId | null) => {
    setTypeId(id);
    const r = resolveItemType(useItemTypeStore.getState().types, id);
    setTypeParts(r?.parts.map((p) => p.id) ?? []);
    if (!r) return;
    const tags = useTaskStore.getState().tags;
    setDraft((d) => ({
      ...d,
      ...(r.defaults.important && !touched.current.has('priority') ? { priority: 'high' as const } : {}),
      tagIds: [...d.tagIds, ...(r.defaults.tagIds ?? []).filter((t) => tags[t] && !d.tagIds.includes(t))],
    }));
  };

  // A new parent brings its priority, Endeavour, tags and purposes, unless the person set them.
  const pickParent = (next: TaskId | '') => {
    const p = next ? tasksRecord[next] : undefined;
    setDraft((d) => ({
      ...d, parentId: next || null,
      ...(!touched.current.has('priority') ? { priority: p?.priority || 'none' } : {}),
      ...(!touched.current.has('collectionId') ? { collectionId: p?.collectionId ?? null } : {}),
      ...(!touched.current.has('tagIds') ? { tagIds: p?.tagIds ?? [] } : {}),
      ...(!touched.current.has('purposeIds') ? { purposeIds: p?.purposeIds ?? [] } : {}),
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const pendingArtifactLink = useUIStore.getState().pendingArtifactLink;
    const autoRef = pendingArtifactLink
      ? [{ type: 'note' as const, id: pendingArtifactLink.noteId, ...(pendingArtifactLink.tabId ? { tabId: pendingArtifactLink.tabId } : {}) }]
      : [];
    const crossAppRefs = [...autoRef, ...manualCrossAppRefs].filter((ref, i, all) => all.findIndex((r) => r.type === ref.type && r.id === ref.id) === i);

    const taskId = addTaskWithCalendar({
      title: draft.title.trim(),
      notes: draft.notes || null,
      links: draft.links.filter(Boolean),
      // A repeating task with no date starts from today (services/recurringTasks.ts).
      deadline: draft.deadline || (draft.repeat && !draft.scheduledAt ? todayIso() : null),
      deadlineTime: draft.deadlineTime || null,
      scheduledAt: draft.scheduledAt || null,
      scheduledTime: draft.scheduledTime || null,
      priority: draft.priority,
      timeIntensity: draft.timeIntensity,
      collectionId: draft.collectionId,
      tagIds: commitTags(draft.tagIds),
      purposeIds: draft.purposeIds,
      kind: draft.kind,
      parentId: (draft.parentId as TaskId | null) ?? null,
      crossAppRefs,
      itemLinks: followUpOrigin ? [makeItemLink('followUpOf', followUpOrigin.id, null, now())]
        : pendingEventLink && eventItem ? [{ ...makeItemLink(pendingEventLink.kind, pendingEventLink.targetId, null, now(), pendingEventLink.targetType), ...(pendingEventLink.occurrence ? { occurrence: pendingEventLink.occurrence } : {}) }]
        : undefined,
      repeat: draft.parentId ? null : draft.repeat,
    });

    for (const c of calendarLinks) linkTaskToEvent(taskId, c.kind, c.type, c.id, c.occurrence);
    if (typeId) applyItemType({ kind: 'task', id: taskId }, typeId, typeValues, typeParts);
    if (pendingArtifactLink) useUIStore.getState().resolveArtifactLink(taskId);
    closeModal();
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{typeName ? LABELS.itemTypes.newOf(typeName) : L.newTitle}</span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label={L.close}><CloseIcon /></button>
        </div>
        {followUpOrigin && <div className={styles.followUpBanner}>{ITEM_LINK_KINDS.followUpOf.icon} {LABELS.taskLinks.followUpBanner(followUpOrigin.title)}</div>}
        {pendingEventLink && eventItem && (
          <div className={styles.followUpBanner}>
            {ITEM_LINK_KINDS[pendingEventLink.kind].icon} {(pendingEventLink.kind === 'prepFor' ? LABELS.taskLinks.event.prepBanner : LABELS.taskLinks.event.followBanner)(eventItem.title)}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          <TaskFields item={draft} update={update} liveText autoFocusTitle idPrefix="new-task" scheduledHint={L.addedToCalendar}
            moreHidden={!advanced} onShowMore={() => setAdvanced(true)}
            typeField={<ItemTypeField typeId={typeId} values={typeValues} onTypeChange={pickType}
              onValueChange={(fieldId, v) => setTypeValues((prev) => ({ ...prev, [fieldId]: v }))}
              parts={{ chosen: typeParts, onChange: setTypeParts, date: draft.deadline || draft.scheduledAt || null }} />}
            linkedItems={<>
              <CrossAppRefPicker value={manualCrossAppRefs} onChange={setManualCrossAppRefs} suggestFrom={draft.title}
                extraAdds={[{ label: LABELS.taskLinks.linkCalendar, onClick: () => setPickingCalendar(true) }]} />
              {/* Calendar items, linked when the task is made; the first date chosen fills its dates. */}
              <TaskCalendarLinks pending={calendarLinks} suggestFrom={draft.title} picking={pickingCalendar} onPicking={setPickingCalendar} onPending={(next, added) => {
                setCalendarLinks(next);
                if (!added?.length) return;
                const dates = linkedTaskDates(added[0].kind, added[0].type, added[0].id, added[0].occurrence);
                setDraft((d) => ({
                  ...d,
                  ...(dates.deadline && !d.deadline ? { deadline: dates.deadline, deadlineTime: dates.deadlineTime ?? null } : {}),
                  ...(dates.scheduledAt && !d.scheduledAt ? { scheduledAt: dates.scheduledAt } : {}),
                }));
              }} />
            </>}
            more={topLevelTasks.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-task-parent">{L.parent}</label>
                <select id="new-task-parent" className={styles.select} value={draft.parentId ?? ''} onChange={(e) => pickParent(e.target.value as TaskId | '')}>
                  <option value="">{L.noParent}</option>
                  {topLevelTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            )} />

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!draft.title.trim() || (draft.kind === 'milestone' && !draft.deadline)}>{L.add}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import type { CalendarEvent, CalendarEventType, CalendarItemKind, CalendarReminder } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { timeAddMinutes } from '@/utils/date';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import { inferCalendarItemFromSelection } from '@/utils/textToTask';
import { datedPatch, datedRule, defaultRule, eventPatch, eventRule, fitRule } from '@/utils/notifyRule';
import { buildCalendarEventInput, buildCalendarReminderInput, buildCalendarDeadlineInput } from '@/utils/calendarItemInput';
import type { CollectionId, ItemTypeId, CalendarEventId, CalendarDeadlineId } from '@/types';
import { ItemTypeField } from '@/components/ItemTypeField/ItemTypeField';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { eventPresets, resolveItemType } from '@/utils/itemTypes';
import { applyItemType } from '@/services/itemTypes';
import { eventKind, kindPatch } from '@/config/calendarEventTypes';
import { travelModeFromTitle } from '@/services/calendarImport/classify';
import { EVENT_DEFAULTS } from '@/config/builtInTypes';
import { CalendarItemFields, type ItemValues } from '@/components/CalendarItemForm/CalendarItemFields';
import { makePendingTasks } from '@/components/CalendarItemForm/makePendingTasks';
import type { PendingTask } from '@/components/TaskLinks/EventTasksField';
import styles from './AddCalendarItemModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon } from '@/components/Icons';

const KINDS: CalendarItemKind[] = ['event', 'reminder', 'deadline'];
const L = LABELS.calendarForm;

function todayStr(): string {
  return todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));
}

// A new calendar item: the same fields as its pane (components/CalendarItemForm, agreed with the user
// 2026-11-05), in a centred modal, over a draft that's made when Create is pressed. Only what
// creating needs is here: the Event / Reminder / Deadline switch (Ctrl+Tab), the magic wand, Create.
export function AddCalendarItemModal() {
  const closeModal         = useUIStore((s) => s.closeModal);
  const prefillDate        = useUIStore((s) => s.calendarItemDate);
  const prefillKind        = useUIStore((s) => s.calendarItemKind);
  const prefillTime        = useUIStore((s) => s.calendarItemTime);
  const prefillTitle       = useUIStore((s) => s.calendarItemTitle);
  const prefillExtra       = useUIStore((s) => s.calendarItemExtra);
  const activeCollectionId = useUIStore(selectActiveCollectionId);
  const addEvent           = useCalendarStore((s) => s.addEvent);
  const addReminder        = useCalendarStore((s) => s.addReminder);
  const addDeadline        = useCalendarStore((s) => s.addDeadline);

  const [kind, setKindState] = useState<CalendarItemKind>(prefillKind ?? 'event');
  // A Type to start from (Types are switched off: config/features.ts).
  const [initialTypeId] = useState<ItemTypeId | null>(() => prefillExtra?.typeId ?? useUIStore.getState().pendingItemTypeId);
  const [draft, setDraft] = useState<ItemValues>(() => {
    const presets = eventPresets(useItemTypeStore.getState().types, initialTypeId);
    const eventType: CalendarEventType = prefillExtra?.eventType ?? 'default';
    const pending = useUIStore.getState().pendingArtifactLink;
    return {
      title:        prefillTitle ?? '',
      date:         prefillDate ?? todayStr(),
      endDate:      null,
      startTime:    prefillTime ?? null,
      endTime:      prefillExtra?.endTime ?? (prefillTime ? timeAddMinutes(prefillTime, 30) : null),
      time:         prefillTime ?? null,
      notes:        prefillExtra?.notes ?? null,
      location:     prefillExtra?.location ?? null,
      status:       prefillExtra?.tentative ? 'tentative' : 'confirmed',
      important:    prefillExtra?.important ?? !!resolveItemType(useItemTypeStore.getState().types, initialTypeId)?.defaults.important,
      collectionId: (prefillExtra?.collectionId ?? activeCollectionId) as CollectionId | null,
      repeat:       prefillExtra?.repeat ?? presets?.repeat ?? null,
      icon:         presets?.icon ?? null,
      quiet:        !!presets?.quiet,
      background:   false,
      color:        null,
      eventType,
      travelMode:   prefillExtra?.travelMode ?? null,
      links:        [],
      crossAppRefs: pending ? [{ type: 'note' as const, id: pending.noteId, ...(pending.tabId ? { tabId: pending.tabId } : {}) }] : [],
      pictureIds:   [],
      taskRules:    [],
      onClass:      null,
      // A kind read from a note (a birthday, a journey): what it presets.
      ...(eventType !== 'default' && eventType !== 'task' ? kindPatch({ repeat: prefillExtra?.repeat ?? null, quiet: false, background: false, travelMode: prefillExtra?.travelMode ?? null }, eventType) : {}),
    };
  });
  const [pending, setPending] = useState<PendingTask[]>([]);
  // Notify: until the person touches it, the usual rule for the kind (an event: off; a reminder or
  // deadline: on, at its time or the evening before), worked out from the current time.
  const [notifyTouched, setNotifyTouched] = useState(() => !!eventKind(prefillExtra?.eventType).presets.notify);
  const [typeId, setTypeId] = useState<ItemTypeId | null>(initialTypeId);
  const [typeValues, setTypeValues] = useState<Record<string, unknown>>({});
  const [typeParts, setTypeParts] = useState<string[]>(() => resolveItemType(useItemTypeStore.getState().types, typeId)?.parts.map((p) => p.id) ?? []);
  const typeName = useItemTypeStore((st) => (typeId ? st.types[typeId]?.name : undefined));
  const [wandOpen, setWandOpen] = useState(false);
  // Remounts the fields when the wand fills them in, so they show what it read.
  const [fillCount, setFillCount] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const isEvent = kind === 'event';
  const timed = isEvent ? !!draft.startTime : !!draft.time;
  const notifyDefaults = isEvent ? eventPatch({ kind: 'off' }) : datedPatch(defaultRule(kind, timed));
  const shown: ItemValues = notifyTouched ? draft : { ...draft, ...notifyDefaults };

  const update = (patch: ItemValues) => {
    const notifyChange = ['notify', 'notifyMode', 'notifyBeforeValue', 'notifyDaysBefore', 'notifyAtTime'].some((k) => k in patch);
    // The first change to Notify starts from the usual rule shown, so its other settings are kept.
    const base = notifyChange && !notifyTouched ? notifyDefaults : {};
    if (notifyChange) setNotifyTouched(true);
    setDraft((d) => ({ ...d, ...base, ...patch }));
  };
  // Switching kind keeps what was typed; a time moves between an event's start and a reminder's time.
  const setKind = (next: CalendarItemKind) => {
    setDraft((d) => (next === 'event' ? { ...d, startTime: d.startTime ?? d.time ?? null } : { ...d, time: d.time ?? d.startTime ?? null }));
    setNotifyTouched(false);
    setKindState(next);
  };

  // Abandoning the modal must drop a pending Notes "Create ▸ Calendar item" link request, or a
  // later unrelated creation could pick it up (same reason AddTaskModal does this).
  const handleClose = () => {
    if (useUIStore.getState().pendingArtifactLink) useUIStore.getState().clearPendingArtifactLink();
    closeModal();
  };

  useEscapeClose(() => { handleClose(); });
  useCtrlEnterSubmit(() => formRef.current?.requestSubmit());

  // Ctrl+Tab / Ctrl+Shift+Tab: Event → Reminder → Deadline. Capture phase, so nothing under the
  // modal (a note's own Ctrl+Tab) also acts on it.
  const kindRef = useRef(kind);
  useEffect(() => { kindRef.current = kind; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      const k = kindRef.current;
      setKind(KINDS[(KINDS.indexOf(k) + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length]);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // A Type chosen (switched off for now): its parts ticked, and what it presets.
  function chooseType(tid: ItemTypeId | null) {
    setTypeId(tid);
    const types = useItemTypeStore.getState().types;
    setTypeParts(resolveItemType(types, tid)?.parts.map((p) => p.id) ?? []);
    const p = eventPresets(types, tid);
    update({
      ...(resolveItemType(types, tid)?.defaults.important ? { important: true } : {}),
      icon: p?.icon ?? null, quiet: !!p?.quiet,
      ...(p?.allDay ? { startTime: null, endTime: null } : {}),
      ...(p?.repeat && !draft.repeat ? { repeat: p.repeat } : {}),
    });
  }

  // The magic wand: read a pasted description into the form (the same reader that turns selected
  // note text into a calendar item), then leave it there to check.
  function fillFromText(text: string): boolean {
    const cal = inferCalendarItemFromSelection(text);
    const found = cal.date || cal.startTime || cal.location || cal.repeat || cal.links.length;
    if (!found && cal.title === text.trim()) return false;
    setKind(cal.kind);
    const patch: ItemValues = {
      ...(cal.title ? { title: cal.title } : {}),
      ...(cal.date ? { date: cal.date, ...(draft.endDate && draft.endDate <= cal.date ? { endDate: null } : {}) } : {}),
      location: cal.location ?? null,
      links: [...new Set([...(draft.links ?? []), ...cal.links.filter((l) => l !== cal.location)])],
      status: cal.tentative ? 'tentative' : 'confirmed',
      important: cal.important,
      repeat: cal.repeat,
    };
    if (cal.kind === 'event') {
      Object.assign(patch, { startTime: cal.startTime ?? null, endTime: cal.endTime ?? (cal.startTime ? timeAddMinutes(cal.startTime, 30) : null) });
      if (cal.eventType !== 'default') {
        Object.assign(patch, kindPatch({ repeat: cal.repeat, quiet: draft.quiet, background: draft.background ?? false, travelMode: null }, cal.eventType));
        if (cal.eventType === 'travel') patch.travelMode = travelModeFromTitle(cal.title, false);
      }
    } else {
      patch.time = cal.startTime ?? null;
    }
    update(patch);
    setFillCount((n) => n + 1);
    return true;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = (draft.title ?? '').trim();
    const date = draft.date ?? '';
    if (!title || !date) return;
    // Created from a Notes selection: report the new id (and the kind actually chosen) back so
    // NoteEditor can apply the forward mark. See AddTaskModal's identical handling.
    const pendingLink = useUIStore.getState().pendingArtifactLink;
    const v = shown;
    const common = {
      title, date, notes: v.notes ?? '', links: v.links ?? [], collectionId: (v.collectionId ?? null) as CollectionId | null,
      repeat: v.repeat ?? null, status: v.status ?? 'confirmed', important: !!v.important, crossAppRefs: v.crossAppRefs ?? [],
    };
    let id: string;
    if (isEvent) {
      const rule = fitRule(eventRule(v as CalendarEvent), 'event', timed);
      const multiDay = !!v.endDate && v.endDate > date;
      id = addEvent(buildCalendarEventInput({
        ...common, endDate: v.endDate ?? '', startTime: v.startTime ?? '', endTime: v.endTime ?? '', location: v.location ?? '',
        icon: v.icon ?? null, quiet: !!v.quiet, eventType: v.eventType ?? 'default', travelMode: v.eventType === 'travel' ? v.travelMode ?? null : null,
        ...eventPatch(rule), background: multiDay ? !!v.background : false, color: multiDay && v.background ? v.color ?? null : null,
      }));
      const after = {
        ...(v.onClass && !v.repeat ? { onClass: v.onClass } : {}),
        ...(v.pictureIds?.length ? { pictureIds: v.pictureIds } : {}),
        ...(v.taskRules?.length ? { taskRules: v.taskRules } : {}),
      };
      if (Object.keys(after).length) useCalendarStore.getState().updateEvent(id as CalendarEventId, after);
    } else {
      const rule = fitRule(datedRule(v as CalendarReminder, kind), kind, timed);
      const dated = { ...common, time: v.time ?? '', ...datedPatch(rule) };
      id = kind === 'reminder' ? addReminder(buildCalendarReminderInput(dated)) : addDeadline(buildCalendarDeadlineInput(dated));
      if (kind === 'deadline' && v.onClass && !v.repeat) useCalendarStore.getState().updateDeadline(id as CalendarDeadlineId, { onClass: v.onClass });
    }
    if (kind !== 'reminder' && pending.length) makePendingTasks(pending, isEvent ? 'event' : 'deadline', id, title, common.collectionId);
    if (typeId && kind === 'event') applyItemType({ kind, id: id as CalendarEventId }, typeId, typeValues, typeParts);
    if (typeId && kind === 'deadline') applyItemType({ kind, id: id as CalendarDeadlineId }, typeId, typeValues, typeParts);
    if (pendingLink) useUIStore.getState().resolveArtifactLink(id, kind);
    closeModal();
  };

  const kindLabel = LABELS.calendarItemKind[kind];

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            <span className={styles.titleIcon} aria-hidden>{ITEM_TYPE_ICON[kind]}</span>
            {typeName && kind !== 'reminder' ? LABELS.itemTypes.newOf(typeName) : L.newItem(kindLabel)}
          </span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className={styles.kindToggle} role="group" aria-label={L.kindSwitch} title={L.kindSwitch}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.kindBtn} ${kind === k ? styles.kindBtnActive : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              <span aria-hidden>{ITEM_TYPE_ICON[k]}</span> {LABELS.calendarItemKind[k]}
            </button>
          ))}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.body}>
            <CalendarItemFields
              key={fillCount}
              kind={kind}
              item={shown}
              update={update}
              savedId={null}
              liveText
              autoFocusTitle
              pending={pending}
              onPending={setPending}
              titleLead={<MagicWandButton open={wandOpen} onToggle={() => setWandOpen((o) => !o)} />}
              afterTitle={wandOpen ? <MagicWandPanel hint={L.wandHint} onRead={fillFromText} onClose={() => setWandOpen(false)} /> : null}
              typeField={kind !== 'reminder' ? (
                <ItemTypeField
                  typeId={typeId}
                  values={typeValues}
                  onTypeChange={chooseType}
                  defaults={isEvent ? EVENT_DEFAULTS : undefined}
                  onValueChange={(fieldId, val) => setTypeValues((prev) => ({ ...prev, [fieldId]: val }))}
                  parts={{ chosen: typeParts, onChange: setTypeParts, date: draft.date || null }}
                />
              ) : undefined}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!(draft.title ?? '').trim() || !draft.date}>
              {L.addItem(kindLabel)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

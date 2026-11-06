import { useRef, useState, type ReactNode } from 'react';
import type { CalendarDeadline, CalendarEvent, CalendarItemKind, CalendarReminder, CollectionId, CrossAppRef } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { eventKind, kindIcon, kindPatch } from '@/config/calendarEventTypes';
import { addDaysToIso, computeLinkedEndTime, timeAddMinutes, todayIso } from '@/utils/date';
import { datedPatch, datedRule, eventPatch, eventRule } from '@/utils/notifyRule';
import { showAsOf, showAsPatch } from '@/utils/showAs';
import { newNoteTitleFor } from '@/services/noteFromItem';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';
import { EventKindField } from '@/components/EventKindField/EventKindField';
import { IconField } from '@/components/IconPicker/IconField';
import { EventWhenField } from '@/components/EventWhenField/EventWhenField';
import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { LinkedNoteAbstracts } from '@/components/LinkedNoteAbstracts/LinkedNoteAbstracts';
import { ShowAsField } from '@/components/ShowAsField/ShowAsField';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { ClassClashField } from '@/components/ClassClashField/ClassClashField';
import { FlagCheck } from '@/components/FlagCheck/FlagCheck';
import { NotifyRuleField } from '@/components/AllDayNotifyField/NotifyLead';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { LinksField } from '@/components/LinksField/LinksField';
import { EventTasksField, type PendingTask } from '@/components/TaskLinks/EventTasksField';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { PicturesField } from '@/components/PictureInput/PicturesField';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { OpenIcon } from '@/components/Icons';
import styles from './CalendarItemFields.module.css';

// THE fields of a calendar item (agreed with the user 2026-11-05: "the create and edit panes should
// be exactly the same"; they had drifted, pictures, tasks and linked items only in the pane). The
// create form (AddCalendarItemModal, a centred modal) and the item panes (CalendarEventPane,
// CalendarReminderPane, CalendarDeadlinePane, from the side) both render this, in this order; a new
// field is added here once. What only one of them has is around it, not in it: the create form's
// kind switch and magic wand (the `titleLead` / `afterTitle` slots), a pane's banners, which-dates
// line and footer.
//
// The item is the stored one (a pane) or a draft held by the form; `update` saves a change (a pane:
// through useSeriesScope; the form: into its draft). What needs a saved item (tasks to link) is held
// by the form as `pending` and made when it's created.

// Any field of an event, reminder or deadline (the form's draft holds one shape for all three).
type AnyItem = Omit<CalendarEvent, 'id'> | Omit<CalendarReminder, 'id'> | Omit<CalendarDeadline, 'id'>;
type KeysOf<T> = T extends unknown ? keyof T : never;
type ValueOf<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;
export type ItemValues = { [K in KeysOf<AnyItem>]?: ValueOf<AnyItem, K> };

export function CalendarItemFields({ kind, item, update, savedId, occurrence = null, liveText = false, isTaskShadow = false, hasLinkedTask = false,
  titleLead, afterTitle, typeField, onRefsChange, onNavigate, pending, onPending, autoFocusTitle = false }: {
  kind: CalendarItemKind;
  item: ItemValues;
  update: (patch: ItemValues) => void;
  savedId: string | null;          // null: not made yet (the create form)
  occurrence?: string | null;      // the date opened, for a repeating item's tasks
  liveText?: boolean;              // title and notes saved as typed (the form), not on leaving (a pane)
  isTaskShadow?: boolean;          // a task's calendar copy: no kind, icon, repeat or tasks of its own
  hasLinkedTask?: boolean;         // a task's deadline: its tasks are the task's
  titleLead?: ReactNode;
  afterTitle?: ReactNode;
  typeField?: ReactNode;           // Types (switched off: config/features.ts)
  onRefsChange?: (next: CrossAppRef[]) => void;
  onNavigate?: (ref: CrossAppRef) => void;
  pending?: PendingTask[];
  onPending?: (next: PendingTask[]) => void;
  autoFocusTitle?: boolean;
}) {
  const L = LABELS.calendarForm;
  const collections = useTaskStore((s) => s.collections);
  const allCollections = Object.values(collections);
  const isEvent = kind === 'event';
  const [title, setTitle] = useState(item.title ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, setNotes);
  // Whether the end time is still the one worked out from the start (see CLAUDE.md "Timepicker"):
  // a saved end counts as the person's own.
  const endAutoRef = useRef(!savedId);
  // A title the wand (or a kind) put in: shown, not lost.
  const [shownTitle, setShownTitle] = useState(item.title ?? '');
  if ((item.title ?? '') !== shownTitle) { setShownTitle(item.title ?? ''); setTitle(item.title ?? ''); }
  const [shownNotes, setShownNotes] = useState(item.notes ?? '');
  if ((item.notes ?? '') !== shownNotes) { setShownNotes(item.notes ?? ''); setNotes(item.notes ?? ''); }

  const date = item.date ?? '';
  const multiDay = isEvent && !!item.endDate && item.endDate > date;
  const repeats = !!item.repeat;

  const setDate = (v: string) => update({ date: v, ...(item.endDate && item.endDate <= v ? { endDate: null } : {}) });
  const onStartTime = (val: string) => {
    const patch: ItemValues = { startTime: val || null };
    if (val) {
      const { time, dayOffset } = computeLinkedEndTime(val, endAutoRef.current ? '' : (item.endTime ?? ''));
      patch.endTime = time;
      endAutoRef.current = true;
      if (dayOffset > 0 && !item.endDate) patch.endDate = addDaysToIso(date, dayOffset);
    }
    update(patch);
  };
  const onEndTime = (val: string) => {
    endAutoRef.current = false;
    update({ endTime: val || null, ...(val && item.startTime && val < item.startTime ? { startTime: timeAddMinutes(val, -30) } : {}) });
  };
  const saveTitle = () => { const v = title.trim(); if (v && v !== item.title) update({ title: v }); else if (!v && savedId) setTitle(item.title ?? ''); };
  const saveNotes = () => { const v = notes.trim() || null; if (v !== (item.notes ?? null)) update({ notes: v }); };

  const location = item.location ?? '';
  const isUrl = /^https?:\/\//i.test(location) || /^maps\.google\./i.test(location);
  const mapsUrl = isUrl ? location : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const rule = isEvent ? eventRule(item as CalendarEvent) : datedRule(item as CalendarReminder, kind as 'reminder' | 'deadline');
  const timed = isEvent ? !!item.startTime : !!item.time;

  return (
    <>
      {isEvent && !isTaskShadow && (
        <EventKindField kind={item.eventType ?? 'default'} date={date} today={todayIso()}
          onKind={(k) => update(kindPatch({ repeat: item.repeat ?? null, quiet: item.quiet, background: item.background ?? false, travelMode: item.travelMode ?? null }, k))}
          onDate={setDate} />
      )}

      <div className={styles.titleRow}>
        {titleLead}
        {isEvent && !isTaskShadow && (
          <IconField value={item.icon ?? null} onChange={(icon) => update({ icon })} fallback={kindIcon({ eventType: item.eventType ?? 'default', travelMode: item.travelMode ?? null }) || ITEM_TYPE_ICON.event} label={L.icon} className={styles.titleIcon} />
        )}
        <input
          className={styles.titleInput}
          placeholder={L.titleOf(LABELS.calendarItemKind[kind])}
          aria-label={L.titleOf(LABELS.calendarItemKind[kind])}
          value={title}
          autoFocus={autoFocusTitle}
          onChange={(e) => { setTitle(e.target.value); if (liveText) { setShownTitle(e.target.value); update({ title: e.target.value }); } }}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (!liveText && e.key === 'Enter') e.currentTarget.blur(); }}
        />
      </div>
      {afterTitle}

      <textarea
        ref={notesRef}
        className={styles.notesInput}
        placeholder={L.notesHint}
        aria-label={L.notes}
        value={notes}
        onChange={(e) => { setNotes(e.target.value); if (liveText) { setShownNotes(e.target.value); update({ notes: e.target.value || null }); } }}
        onBlur={saveNotes}
        rows={3}
      />

      <LinkedNoteAbstracts refs={item.crossAppRefs ?? []} onOpen={(ref) => onNavigate?.(ref)} />

      {isEvent ? (
        <div className={styles.field}>
          <EventWhenField date={date} endDate={item.endDate ?? ''} startTime={item.startTime ?? ''} endTime={item.endTime ?? ''}
            allDay={!!eventKind(item.eventType).presets.allDay}
            onDate={setDate} onEndDate={(v) => update({ endDate: v || null })} onStartTime={onStartTime} onEndTime={onEndTime} />
        </div>
      ) : (
        <div className={styles.field}>
          <span className={styles.label}>{L.date}</span>
          <div className={styles.timeRow}>
            <DateInput className={styles.dateInput} value={date} onChange={setDate} required aria-label={L.date} />
            <TimeInput className={styles.timeInput} value={item.time ?? ''} onChange={(v) => update({ time: v || null })} placeholder={L.timeOptional} />
          </div>
        </div>
      )}

      {isEvent && (
        <div className={styles.field}>
          <span className={styles.label}>{L.location}</span>
          <div className={styles.locationRow}>
            <input type="text" className={styles.textInput} value={location} placeholder={L.locationHint} aria-label={L.location}
              onChange={(e) => update({ location: e.target.value || null })} />
            {location && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.locationLink} title={isUrl ? L.openLink : L.openMap}>
                {isUrl ? <OpenIcon /> : '🗺'}
              </a>
            )}
          </div>
        </div>
      )}

      {isEvent && !isTaskShadow && (
        <div className={styles.field}>
          <ShowAsField value={showAsOf({ quiet: item.quiet, background: item.background ?? false }, multiDay)} multiDay={multiDay}
            onChange={(v) => update({ ...showAsPatch(v), color: v === 'background' ? item.color ?? null : null })} />
          {item.background && multiDay && <ColorPicker palette="standard" value={item.color ?? null} onChange={(c) => update({ color: c })} />}
        </div>
      )}

      {kind !== 'reminder' && !repeats && date && (
        <ClassClashField
          item={{ id: savedId ?? undefined, date, start: isEvent ? item.startTime || null : item.time || null, end: isEvent ? item.endTime || null : null, collectionId: item.collectionId ?? null }}
          value={item.onClass ?? null}
          onChange={(onClass) => update({ onClass })}
        />
      )}

      {typeField}

      <div className={styles.field}>
        <FlagCheck flag="important" className={styles.checkLabel} checked={item.important ?? false} onChange={(on) => update({ important: on })}>
          {L.importantHint}
        </FlagCheck>
      </div>

      <div className={styles.field}>
        <FlagCheck flag="tentative" className={styles.checkLabel} checked={(item.status ?? 'confirmed') === 'tentative'} onChange={(on) => update({ status: on ? 'tentative' : 'confirmed' })}>
          {L.tentative}
        </FlagCheck>
      </div>

      <div className={styles.field}>
        <NotifyRuleField item={kind} timed={timed} rule={rule} labelClassName={styles.checkLabel}
          onChange={(r) => update(isEvent ? eventPatch(r) : datedPatch(r))} />
      </div>

      {!isTaskShadow && (
        <div className={styles.field}>
          <RepeatField value={item.repeat ?? null} onChange={(r) => update({ repeat: r })} date={date} onDateChange={setDate} labelClassName={styles.checkLabel} />
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{L.links}</span>
        <LinksField links={item.links ?? []} onChange={(links) => update({ links })} />
      </div>

      {kind !== 'reminder' && !isTaskShadow && !hasLinkedTask && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.taskLinks.event.heading}</span>
          <EventTasksField type={isEvent ? 'event' : 'deadline'} id={savedId} title={item.title ?? ''} repeats={repeats} occurrence={occurrence}
            draft={savedId ? undefined : { rules: item.taskRules ?? [], onRules: (taskRules) => update({ taskRules }), pending: pending ?? [], onPending: onPending ?? (() => {}) }} />
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{L.linkedItems}</span>
        <CrossAppRefPicker
          value={item.crossAppRefs ?? []}
          suggestFrom={item.title ?? ''}
          newNoteTitle={newNoteTitleFor(item.title ?? '', date)}
          onChange={(next) => (onRefsChange ? onRefsChange(next) : update({ crossAppRefs: next }))}
          onNavigate={(ref) => onNavigate?.(ref)}
        />
      </div>

      {isEvent && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.pictureInput.field}</span>
          <PicturesField value={item.pictureIds ?? []} onChange={(pictureIds) => update({ pictureIds })} />
        </div>
      )}

      {allCollections.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.collection}</span>
          <CollectionPicker collections={allCollections} value={(item.collectionId ?? null) as CollectionId | null}
            onChange={(collectionId) => update({ collectionId })} noneLabel={`No ${LABELS.collection}`} />
        </div>
      )}

      {linkPrompt && <MarkdownLinkPrompt anchorRect={linkPrompt.anchorRect} initialText={linkPrompt.initialText} onConfirm={confirmLink} onCancel={cancelLink} />}
    </>
  );
}

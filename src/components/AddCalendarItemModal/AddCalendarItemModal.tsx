import { useState, useEffect, useRef } from 'react';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import { DateInput } from '@/components/DateInput/DateInput';
import type { CalendarItemKind, CalendarEventType, EventStatus, RepeatConfig, TravelMode } from '@/types';
import { TravelModePicker } from '@/components/TravelModePicker/TravelModePicker';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { timeAddMinutes, computeLinkedEndTime, addDaysToIso } from '@/utils/date';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import { inferCalendarItemFromSelection } from '@/utils/textToTask';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { NotifyRuleField } from '@/components/AllDayNotifyField/NotifyLead';
import { datedPatch, defaultRule, eventPatch, fitRule, type NotifyRule } from '@/utils/notifyRule';
import { LinksField } from '@/components/LinksField/LinksField';
import { buildCalendarEventInput, buildCalendarReminderInput, buildCalendarDeadlineInput, BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import type { CollectionId } from '@/types';
import { PICKABLE_EVENT_TYPES } from '@/config/calendarEventTypes';
import styles from './AddCalendarItemModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { CloseIcon, DisclosureIcon } from '@/components/Icons';

const KINDS: CalendarItemKind[] = ['event', 'reminder', 'deadline'];
const L = LABELS.calendarForm;

function todayStr(): string {
  return todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));
}

// A checkbox and its words, the same for every option in the form (Important, Tentative, …).
function Check({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// The fields every kind has come in the same order (title, notes, when, Important, Notify, then
// under More options: Tentative, Repeat, Links, Endeavour); an event's own fields (end, type,
// location, background) sit with its date and time (2026-10-19).
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
  const collectionsRecord  = useTaskStore((s) => s.collections);

  const [kind,              setKind]              = useState<CalendarItemKind>(prefillKind ?? 'event');
  const [title,             setTitle]             = useState(prefillTitle ?? '');
  const [date,              setDate]              = useState(prefillDate ?? todayStr());
  const [endDate,           setEndDate]           = useState('');
  const [startTime,         setStartTime]         = useState(prefillTime ?? '');
  const [endTime,           setEndTime]           = useState(prefillExtra?.endTime ?? (prefillTime ? timeAddMinutes(prefillTime, 30) : ''));
  const [time,              setTime]              = useState(prefillTime ?? '');
  const [notes,             setNotes]             = useState(prefillExtra?.notes ?? '');
  const [links,             setLinks]             = useState<string[]>([]);
  const [location,          setLocation]          = useState(prefillExtra?.location ?? '');
  const [eventType,         setEventType]         = useState<CalendarEventType>(prefillExtra?.eventType ?? 'default');
  const [status,            setStatus]            = useState<EventStatus>(prefillExtra?.tentative ? 'tentative' : 'confirmed');
  const [collectionId,      setCollectionId]      = useState<CollectionId | null>(
    (prefillExtra?.collectionId ?? activeCollectionId) as CollectionId | null
  );
  const [important,         setImportant]         = useState(prefillExtra?.important ?? false);
  const [background,        setBackground]        = useState(false);
  const [travelMode,        setTravelMode]        = useState<TravelMode | null>(null);
  const [color,             setColor]             = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, setNotes);
  // Reminders and deadlines: ticked by default; a deadline is told about at 17:00 the day before,
  // a timed reminder at its own time.
  // null until the person touches Notify: an event starts off (opt-in), a reminder or deadline on.
  const [notifyRule,        setNotifyRule]        = useState<NotifyRule | null>(null);
  const [repeat,            setRepeat]            = useState<RepeatConfig | null>(prefillExtra?.repeat ?? null);
  // Opened when something inferred lives in the extra options (repeat, tentative), so the guess is
  // visible rather than silently applied. Closed otherwise, for every kind.
  const [formExpanded,      setFormExpanded]      = useState(!!(prefillExtra?.repeat || prefillExtra?.tentative));
  const [wandOpen,          setWandOpen]          = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Tracks whether `endTime` is still just our own auto-linked guess vs. something the user
  // actually typed into the End field — without this, typing a start time digit-by-digit (hour
  // commits before minute) would cascade: the hour-only commit auto-links an end time, then the
  // minute commit sees that already-set end and "preserves its minutes" instead of re-deriving
  // fresh, producing a stuck/wrong result. See CLAUDE.md's Timepicker section for the full story.
  // A range typed in the note ("2-3pm") arrives as a real end time, not one of our own guesses.
  const endAutoRef = useRef(!prefillExtra?.endTime);

  const allCollections = Object.values(collectionsRecord);
  const isEvent    = kind === 'event';
  const isBirthday = isEvent && eventType === 'birthday';
  const timed = isEvent ? !isBirthday && !!startTime : !!time;
  const shownRule: NotifyRule = notifyRule ?? (isEvent ? { kind: 'off' } : defaultRule(kind, timed));
  const multiDay   = isEvent && !!endDate && endDate > date;

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      setKind((k) => KINDS[(KINDS.indexOf(k) + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length]);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (val) {
      const { time, dayOffset } = computeLinkedEndTime(val, endAutoRef.current ? '' : endTime);
      setEndTime(time);
      endAutoRef.current = true;
      if (dayOffset > 0 && !endDate) setEndDate(addDaysToIso(date, dayOffset));
    }
  };

  const handleEndTimeChange = (val: string) => {
    endAutoRef.current = false;
    setEndTime(val);
    if (val && startTime && val < startTime) {
      setStartTime(timeAddMinutes(val, -30));
    }
  };

  const handleEventTypeChange = (type: CalendarEventType) => {
    setEventType(type);
    if (type === 'birthday') {
      setStartTime('');
      setEndTime('');
      setRepeat(BIRTHDAY_REPEAT);
    }
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    if (endDate && endDate <= value) setEndDate('');
  };

  // The magic wand: read a pasted description into the form (the same reader that turns selected
  // note text into a calendar item), then leave it there to check.
  function fillFromText(text: string): boolean {
    const cal = inferCalendarItemFromSelection(text);
    const found = cal.date || cal.startTime || cal.location || cal.repeat || cal.links.length;
    if (!found && cal.title === text.trim()) return false;
    setKind(cal.kind);
    if (cal.title) setTitle(cal.title);
    if (cal.date) handleDateChange(cal.date);
    if (cal.kind === 'event') {
      setStartTime(cal.startTime ?? '');
      setEndTime(cal.endTime ?? (cal.startTime ? timeAddMinutes(cal.startTime, 30) : ''));
      endAutoRef.current = !cal.endTime;
      setEventType(cal.eventType);
    } else {
      setTime(cal.startTime ?? '');
    }
    setLocation(cal.location ?? '');
    setLinks((prev) => [...new Set([...prev, ...cal.links.filter((l) => l !== cal.location)])]);
    setStatus(cal.tentative ? 'tentative' : 'confirmed');
    setImportant(cal.important);
    setRepeat(cal.repeat);
    if (cal.repeat || cal.tentative) setFormExpanded(true);
    return true;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    // Created from a Notes selection: record the reverse link now and report the new id (and the
    // kind actually chosen — the user may have flipped Event/Reminder) back so NoteEditor can
    // apply the forward mark. See AddTaskModal's identical handling.
    const pending = useUIStore.getState().pendingArtifactLink;
    const crossAppRefs = pending ? [{ type: 'note' as const, id: pending.noteId, ...(pending.tabId ? { tabId: pending.tabId } : {}) }] : [];
    const common = { title, date, notes, links, collectionId, repeat, status, important, crossAppRefs };
    const rule = fitRule(shownRule, kind, timed);
    const dated = { ...common, time, ...datedPatch(rule) };

    const id = kind === 'event'
      ? addEvent(buildCalendarEventInput({
        ...common,
        endDate,
        startTime,
        endTime,
        location,
        eventType,
        travelMode: eventType === 'travel' ? travelMode : null,
        ...eventPatch(rule),
        background: multiDay ? background : false,
        color: multiDay && background ? color : null,
      }))
      : kind === 'reminder'
        ? addReminder(buildCalendarReminderInput(dated))
        : addDeadline(buildCalendarDeadlineInput(dated));
    if (pending) useUIStore.getState().resolveArtifactLink(id, kind);
    closeModal();
  };

  const kindLabel = LABELS.calendarItemKind[kind];

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            <span className={styles.titleIcon} aria-hidden>{ITEM_TYPE_ICON[kind]}</span>
            {L.newItem(kindLabel)}
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
            <div className={styles.titleRow}>
              <MagicWandButton open={wandOpen} onToggle={() => setWandOpen((v) => !v)} />
              <input
                className={styles.titleInput}
                placeholder={L.titleOf(kindLabel)}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {wandOpen && <MagicWandPanel hint={L.wandHint} onRead={fillFromText} onClose={() => setWandOpen(false)} />}

            <textarea
              ref={notesRef}
              className={styles.notes}
              placeholder={L.notes}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />

            <div className={styles.field}>
              <label className={styles.label}>{L.date}</label>
              <div className={styles.timeRow}>
                <DateInput className={styles.dateInput} value={date} onChange={(v) => handleDateChange(v)} required aria-label={L.date} />
                {isEvent && !isBirthday && (
                  <>
                    <span className={styles.timeSep}>→</span>
                    <DateInput className={styles.dateInput} value={endDate} min={date} onChange={(v) => setEndDate(v)} aria-label={L.endDate} />
                  </>
                )}
                {!isEvent && (
                  <TimeInput className={styles.timeInput} value={time} onChange={setTime} placeholder={L.timeOptional} />
                )}
              </div>
            </div>

            {isEvent && !isBirthday && (
              <div className={styles.field}>
                <label className={styles.label}>{L.time}</label>
                <div className={styles.timeRow}>
                  <TimeInput className={styles.timeInput} value={startTime} onChange={handleStartTimeChange} placeholder={L.start} />
                  <span className={styles.timeSep}>→</span>
                  <TimeInput className={styles.timeInput} value={endTime} onChange={handleEndTimeChange} placeholder={L.end} />
                </div>
              </div>
            )}

            {isEvent && (
              <div className={styles.field}>
                <label className={styles.label}>{L.eventType}</label>
                <div className={styles.typeRow}>
                  {PICKABLE_EVENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`${styles.typeBtn} ${eventType === t.value ? styles.typeBtnActive : ''}`}
                      onClick={() => handleEventTypeChange(t.value)}
                    >
                      {t.icon && <span>{t.icon}</span>}
                      {t.label}
                    </button>
                  ))}
                </div>
                {eventType === 'travel' && <TravelModePicker value={travelMode} onChange={setTravelMode} />}
              </div>
            )}

            {isEvent && (
              <div className={styles.field}>
                <label className={styles.label}>{L.location}</label>
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder={L.locationHint}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}

            {multiDay && (
              <div className={styles.field}>
                <Check checked={background} onChange={setBackground}>{L.background}</Check>
                {background && <ColorPicker palette="standard" value={color} onChange={setColor} />}
              </div>
            )}

            <div className={styles.field}>
              <Check checked={important} onChange={setImportant}>{L.important}</Check>
            </div>

            <NotifyRuleField item={kind} timed={timed} rule={shownRule} onChange={setNotifyRule} labelClassName={styles.check} />

            <button type="button" className={styles.formExpandBtn} onClick={() => setFormExpanded((v) => !v)} aria-expanded={formExpanded}>
              <DisclosureIcon open={formExpanded} /> {formExpanded ? L.fewerOptions : L.moreOptions}
            </button>

            {formExpanded && (
              <>
                {!isBirthday && (
                  <div className={styles.field}>
                    <Check checked={status === 'tentative'} onChange={(on) => setStatus(on ? 'tentative' : 'confirmed')}>{L.tentative}</Check>
                  </div>
                )}

                <div className={styles.field}>
                  <RepeatField value={repeat} onChange={setRepeat} labelClassName={styles.check} date={date} onDateChange={handleDateChange} />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>{L.links}</label>
                  <LinksField links={links} onChange={setLinks} />
                </div>

                {allCollections.length > 0 && (
                  <div className={styles.field}>
                    <label className={styles.label}>{LABELS.collection} (optional)</label>
                    <CollectionPicker
                      collections={allCollections}
                      value={collectionId}
                      onChange={(id) => setCollectionId(id)}
                      noneLabel={`No ${LABELS.collection}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>{L.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={!title.trim() || !date}>
              {L.addItem(kindLabel)}
            </button>
          </div>
        </form>
      </div>
      {linkPrompt && (
        <MarkdownLinkPrompt
          anchorRect={linkPrompt.anchorRect}
          initialText={linkPrompt.initialText}
          onConfirm={confirmLink}
          onCancel={cancelLink}
        />
      )}
    </div>
  );
}

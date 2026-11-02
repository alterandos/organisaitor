import { useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { alertDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { deleteSubjectItem, itemTasks, saveSubjectItem } from '@/services/subjectItems';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { ItemTypeField } from '@/components/ItemTypeField/ItemTypeField';
import { ClassClashField } from '@/components/ClassClashField/ClassClashField';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { resolveItemType } from '@/utils/itemTypes';
import { formatDate } from '@/utils/date';
import { blankDraft, draftFromDeadline, draftFromEvent, type SubjectItemDraft, type SubjectItemKind } from '@/utils/subjectItems';
import { LABELS } from '@/config/labels';
import type { CalendarDeadline, CalendarEvent, CollectionId } from '@/types';
import styles from './TemplateEditors.module.css';

// One item of a subject, opened under its line in the subject editor: title, its Type and the
// Type's fields (a Work item's worth is its Weight), when, place, notes and Repeat. A Type's tasks
// (a Revise, a Check the result) are offered ticked and can be unticked before it's made (the user,
// 2026-10-30); an item's tasks are listed under it, to tick off or open. Work can be on a date (repeating or not) or before or after each class
// of the Schedule ("1 day before each lecture"). Saved with Save (or Ctrl+Enter, through the
// editor around it); Escape closes it first.

const L = LABELS.subjectEditor;
const I = L.item;
type When = 'date' | 'before' | 'after';

interface Props {
  subjectId:   CollectionId;
  kind:        SubjectItemKind;
  item:        CalendarEvent | CalendarDeadline | null;
  classes:     string[];      // the Schedule's repeating classes, for Work to follow
  defaultDate: string;
  formRef:     RefObject<HTMLFormElement | null>;
  onDone:      () => void;
}

export function SubjectItemEditor({ subjectId, kind, item, classes, defaultDate, formRef, onDone }: Props) {
  const types = useItemTypeStore((s) => s.types);
  const [draft, setDraft] = useState<SubjectItemDraft>(() => (
    !item ? blankDraft(kind, defaultDate)
      : kind === 'schedule' ? draftFromEvent(item as CalendarEvent)
      : draftFromDeadline(item as CalendarDeadline, useCalendarStore.getState().events)
  ));
  useEscapeClose(onDone);

  const set = (p: Partial<SubjectItemDraft>) => setDraft((d) => ({ ...d, ...p }));
  const when: When = draft.follow ? (draft.follow.offsetDays > 0 ? 'after' : 'before') : 'date';
  const offset = Math.abs(draft.follow?.offsetDays ?? 1);
  useTaskStore((s) => s.tasks);   // its tasks, below, follow changes
  const tasks = item ? itemTasks(item.id) : [];
  // Its Type's tasks are offered when it's new or its Type is being changed.
  const offerParts = !item || draft.typeId !== (item.typeId ?? null);
  const work = kind === 'work';

  function setWhen(next: When) {
    if (next === 'date') { set({ follow: null, repeat: draft.follow ? null : draft.repeat }); return; }
    set({ follow: { title: draft.follow?.title ?? classes[0] ?? '', offsetDays: next === 'before' ? -offset : offset }, repeat: null });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!saveSubjectItem(subjectId, draft, item?.id)) { await alertDialog(classes.length ? I.noDates : I.noClasses); return; }
    onDone();
  }

  async function handleDelete() {
    if (!item) return;
    // A calendar item always has a title, so it's never empty (as in the calendar's own panes).
    if (!(await confirmDelete(work ? L.nounWork : L.nounSchedule, item.title, undefined, { empty: false }))) return;
    deleteSubjectItem(kind, item.id);
    onDone();
  }

  return (
    <form ref={formRef} className={styles.itemEditor} onSubmit={handleSubmit} aria-label={item?.title ?? (work ? I.newWork : I.newSchedule)}>
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span className={styles.cellLabel}>{I.title}</span>
          <input className={styles.input} value={draft.title} autoFocus onChange={(e) => set({ title: e.target.value })} />
        </label>

        {work && (
          <label className={styles.field}>
            <span className={styles.cellLabel}>{I.when}</span>
            <select className={styles.select} value={when} onChange={(e) => setWhen(e.target.value as When)}>
              <option value="date">{I.onDate}</option>
              <option value="before">{I.before}</option>
              <option value="after">{I.after}</option>
            </select>
          </label>
        )}

        {work && when !== 'date' ? (
          <>
            <label className={styles.field}>
              <span className={styles.cellLabel}>{I.cls}</span>
              <select className={styles.select} value={draft.follow?.title ?? ''} onChange={(e) => set({ follow: { title: e.target.value, offsetDays: draft.follow?.offsetDays ?? -1 } })}>
                {!classes.includes(draft.follow?.title ?? '') && <option value={draft.follow?.title ?? ''}>{draft.follow?.title || '—'}</option>}
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.cellLabel}>{I.days}</span>
              <input className={styles.input} type="number" min={0} value={offset}
                onChange={(e) => { const n = Math.max(0, Number(e.target.value) || 0); set({ follow: { title: draft.follow?.title ?? '', offsetDays: when === 'before' ? -n : n } }); }} />
            </label>
          </>
        ) : (
          <label className={styles.field}>
            <span className={styles.cellLabel}>{work ? I.due : draft.repeat ? I.firstDate : I.date}</span>
            <DateInput className={styles.input} value={draft.date} aria-label={work ? I.due : I.date} onChange={(v) => v && set({ date: v })} />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.cellLabel}>{work ? I.by : I.from}</span>
          <TimeInput className={styles.input} value={draft.start ?? ''} placeholder={work ? I.by : I.from} onChange={(v) => set({ start: v || null })} />
        </label>
        {!work && (
          <>
            <label className={styles.field}>
              <span className={styles.cellLabel}>{I.until}</span>
              <TimeInput className={styles.input} value={draft.end ?? ''} placeholder={I.until} onChange={(v) => set({ end: v || null })} />
            </label>
            <label className={styles.field}>
              <span className={styles.cellLabel}>{I.place}</span>
              <input className={styles.input} value={draft.place ?? ''} onChange={(e) => set({ place: e.target.value || null })} />
            </label>
          </>
        )}
        {work && when !== 'date' && classes.length === 0 && <p className={`${styles.hint} ${styles.wide}`}>{I.noClasses}</p>}
        {!draft.repeat && !draft.follow && (
          <div className={styles.wide}>
            <ClassClashField item={{ id: item?.id, date: draft.date, start: draft.start, end: draft.end, collectionId: subjectId }} value={draft.onClass} onChange={(onClass) => set({ onClass })} />
          </div>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span className={styles.cellLabel}>{I.notes}</span>
          <textarea className={styles.input} rows={2} value={draft.notes ?? ''} placeholder={I.notesPlaceholder} onChange={(e) => set({ notes: e.target.value || null })} />
        </label>
      </div>

      {/* Its Type, the Type's fields, and (new, or its Type changed) the Type's tasks, ticked to be made */}
      <ItemTypeField
        typeId={draft.typeId}
        values={draft.typeFields}
        onTypeChange={(tid) => set({ typeId: tid, partIds: resolveItemType(types, tid)?.parts.map((p) => p.id) ?? [] })}
        onValueChange={(fieldId, v) => set({ typeFields: { ...draft.typeFields, [fieldId]: v } })}
        parts={offerParts ? { chosen: draft.partIds ?? [], onChange: (partIds) => set({ partIds }), date: work && when !== 'date' ? null : draft.date } : undefined}
      />

      {!(work && when !== 'date') && (
        <RepeatField value={draft.repeat} date={draft.date} onChange={(repeat) => set({ repeat })} onDateChange={(date) => set({ date })} />
      )}

      {tasks.length > 0 && (
        <section className={styles.section} aria-label={I.tasks}>
          <span className={styles.cellLabel}>{I.tasks}</span>
          <ul className={styles.items}>
            {tasks.map((t) => (
              <li key={t.id} className={styles.taskRow}>
                <input type="checkbox" checked={t.completed} onChange={() => void toggleTaskCompletion(t.id)} aria-label={t.title} />
                <button type="button" className={styles.linkBtn} title={I.openTask} onClick={() => { useUIStore.getState().closeModal(); useUIStore.getState().openTaskPane(t.id); }}>{t.title}</button>
                {t.deadline && <span className={styles.hint}>{formatDate(t.deadline + 'T00:00:00')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.actions}>
        {item && <button type="button" className={styles.dangerBtn} onClick={handleDelete}>{I.delete}</button>}
        <span className={styles.spacer} />
        <button type="button" className={styles.secondaryBtn} onClick={onDone}>{I.cancel}</button>
        <button type="submit" className={styles.submitBtn}>{I.save}</button>
      </div>
    </form>
  );
}

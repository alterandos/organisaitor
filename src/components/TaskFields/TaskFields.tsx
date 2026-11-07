import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { TagField } from '@/components/TagField/TagField';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { LinksField } from '@/components/LinksField/LinksField';
import { PriorityPicker } from '@/components/PriorityPicker/PriorityPicker';
import { TimeNeededPicker } from '@/components/TimeNeededPicker/TimeNeededPicker';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';
import { DisclosureIcon } from '@/components/Icons';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { useTaskStore } from '@/store/taskStore';
import { tagsFromParents } from '@/utils/tagScope';
import { LABELS } from '@/config/labels';
import type { CollectionId, Priority, PurposeId, RepeatConfig, TaskKind, TimeIntensity } from '@/types';
import styles from './TaskFields.module.css';

// THE fields of a task, for a new one and an existing one alike, in one order (adopted 2026-11-07,
// "Creating and editing a thing is one form": the add form and the task pane had laid the same
// fields out apart, in different orders, with different Purpose chips and link boxes). The host
// holds the values: AddTaskModal a draft it makes on Add, TaskPane the stored task, saving each
// change. What only a host has goes in its slots: the Type, the linked items (held until the task is
// made, or linked at once), the parent (a new task), task links and sub-tasks (a saved one).

const L = LABELS.taskFields;

export interface TaskValues {
  title:         string;
  notes:         string | null;
  deadline:      string | null;
  deadlineTime:  string | null;
  scheduledAt:   string | null;
  scheduledTime: string | null;
  priority:      Priority;
  timeIntensity: TimeIntensity | null;
  kind:          TaskKind;
  collectionId:  CollectionId | null;
  purposeIds:    PurposeId[];
  tagIds:        string[];
  links:         string[];
  repeat:        RepeatConfig | null;
  parentId:      string | null;
}

export function TaskFields({ item, update, liveText, scheduledHint, typeField, linkedItems, more, moreHidden, onShowMore, autoFocusTitle = false, idPrefix }: {
  item: TaskValues;
  update: (patch: Partial<TaskValues>) => void;
  // Title and notes saved as typed (a new task) or on leaving the field (the pane).
  liveText: boolean;
  scheduledHint: string;
  typeField?: ReactNode;
  linkedItems: ReactNode;
  // After the shared fields: the parent (new), or task links and sub-tasks (saved).
  more?: ReactNode;
  // A new task keeps the less-used fields folded until asked for (hovering or pressing "More options").
  moreHidden?: boolean;
  onShowMore?: () => void;
  autoFocusTitle?: boolean;
  idPrefix: string;
}) {
  const collections = useTaskStore((s) => s.collections);
  const purposes = useTaskStore((s) => s.purposes);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');
  // A title or notes given from outside (a picked event's title) shows.
  const [shownTitle, setShownTitle] = useState(item.title);
  if (item.title !== shownTitle) { setShownTitle(item.title); setTitle(item.title); }
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, (v) => { setNotes(v); if (liveText) update({ notes: v || null }); });

  // The notes grow with what's in them, up to 40% of the window, then scroll.
  useEffect(() => {
    const fit = () => {
      const el = notesRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [notes]);

  const saveTitle = () => { const v = title.trim(); if (v && v !== item.title) update({ title: v }); else if (!v && !liveText) setTitle(item.title); };
  const saveNotes = () => { const v = notes.trim() || null; if (v !== (item.notes ?? null)) update({ notes: v }); };
  const purposeList = Object.values(purposes).filter((p) => !p.archivedAt || item.purposeIds.includes(p.id as PurposeId));
  const collectionList = Object.values(collections);
  const milestone = item.kind === 'milestone';

  return (
    <>
      <input className={styles.titleInput} value={title} placeholder={L.titlePlaceholder} aria-label={L.title} autoFocus={autoFocusTitle}
        onChange={(e) => { setTitle(e.target.value); if (liveText) update({ title: e.target.value }); }}
        onBlur={liveText ? undefined : saveTitle} onKeyDown={(e) => { if (!liveText && e.key === 'Enter') e.currentTarget.blur(); }} />
      <textarea ref={notesRef} className={styles.notesInput} placeholder={L.notesPlaceholder} value={notes} rows={2} aria-label={L.notes}
        onChange={(e) => { setNotes(e.target.value); if (liveText) update({ notes: e.target.value || null }); }} onBlur={liveText ? undefined : saveNotes} />

      {/* When: the due and scheduled dates side by side, each as wide as it needs. */}
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-due`}>{milestone ? LABELS.milestoneDate : L.due}{milestone && <span className={styles.required}>*</span>}</label>
          <div className={styles.dateTimeRow}>
            <DateInput id={`${idPrefix}-due`} className={styles.dateInput} value={item.deadline ?? ''} required={milestone}
              onChange={(v) => update(v ? { deadline: v } : { deadline: null, deadlineTime: null })} />
            {(item.deadline || milestone) && <TimeInput className={styles.timeInput} value={item.deadlineTime ?? ''} placeholder={L.time} onChange={(v) => update({ deadlineTime: v || null })} />}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-scheduled`}>{LABELS.scheduledFor}</label>
          <div className={styles.dateTimeRow}>
            <DateInput id={`${idPrefix}-scheduled`} className={styles.dateInput} value={item.scheduledAt ?? ''}
              onChange={(v) => update(v ? { scheduledAt: v } : { scheduledAt: null, scheduledTime: null })} />
            {item.scheduledAt && <TimeInput className={styles.timeInput} value={item.scheduledTime ?? ''} placeholder={L.time} onChange={(v) => update({ scheduledTime: v || null })} />}
          </div>
          {item.scheduledAt && <span className={styles.scheduledHint}>{scheduledHint}</span>}
        </div>
      </div>

      {/* Priority and the time it needs share a line, wrapping when narrow. */}
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.priority.label}</span>
          <PriorityPicker id={`${idPrefix}-priority`} value={item.priority} onChange={(priority) => update({ priority })} />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.timeNeeded.label}</span>
          <TimeNeededPicker id={`${idPrefix}-time`} value={item.timeIntensity} onChange={(timeIntensity) => update({ timeIntensity })} />
        </div>
      </div>

      {typeField}

      {collectionList.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>{LABELS.collection}</span>
          <CollectionPicker collections={collectionList} value={item.collectionId} onChange={(collectionId) => update({ collectionId })} noneLabel={LABELS.noCollection} />
        </div>
      )}

      {moreHidden ? (
        <div className={styles.expandBar} role="button" tabIndex={0} aria-label={L.more} onMouseEnter={onShowMore}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowMore?.(); } }} onClick={onShowMore}>
          <DisclosureIcon open={false} /> {L.more}
        </div>
      ) : (
        <>
          {/* Repeat: not on a sub-task, which repeats with its parent. */}
          {!item.parentId && (
            <div className={styles.field}>
              <RepeatField value={item.repeat} hint={LABELS.recurring.hint} date={item.deadline ?? item.scheduledAt} onChange={(repeat) => update({ repeat })} />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>{LABELS.taskKind.label}</span>
            {/* Switches (2026-11-06): neither on is an ordinary task ('action'). */}
            <div className={styles.row}>
              {(['waiting', 'milestone'] as TaskKind[]).map((k) => (
                <button key={k} type="button" aria-pressed={item.kind === k} className={`${styles.pill} ${item.kind === k ? styles.pillKindActive : ''}`}
                  onClick={() => update({ kind: item.kind === k ? 'action' : k })}>
                  {k === 'waiting' ? '⏳ ' : '◆ '}{LABELS.taskKind[k]}
                </button>
              ))}
            </div>
          </div>

          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>{L.purposes}</span>
              <div className={styles.chips}>
                {purposeList.map((p) => {
                  const active = item.purposeIds.includes(p.id as PurposeId);
                  return (
                    <button key={p.id} type="button" aria-pressed={active} className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                      style={active && p.color ? { background: p.color + '22', borderColor: p.color, color: p.color } : undefined}
                      onClick={() => update({ purposeIds: active ? item.purposeIds.filter((x) => x !== p.id) : [...item.purposeIds, p.id as PurposeId] })}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <TagField value={item.tagIds} onChange={(tagIds) => update({ tagIds })} labelClassName={styles.label}
              inherited={item.collectionId ? tagsFromParents([item.collectionId], collections) : []}
              fromName={(id) => collections[id as CollectionId]?.name ?? ''} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{L.links}</span>
            <LinksField links={item.links} onChange={(links) => update({ links })} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{L.linkedItems}</span>
            {linkedItems}
          </div>

          {more}
        </>
      )}
      {linkPrompt && <MarkdownLinkPrompt anchorRect={linkPrompt.anchorRect} initialText={linkPrompt.initialText} onConfirm={confirmLink} onCancel={cancelLink} />}
    </>
  );
}

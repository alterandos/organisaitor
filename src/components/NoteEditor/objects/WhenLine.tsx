import { useEffect, useRef, useState } from 'react';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { takeOccurrenceListRequest } from './occurrenceRequests';
import { usePaneState } from './paneState';
import { LABELS } from '@/config/labels';
import type { ArtifactSummary, ArtifactTypeDef } from './artifactTypes';
import styles from './ObjectBody.module.css';

interface Props {
  def:        ArtifactTypeDef;
  id:         string;
  targetType: string;
  summary: ArtifactSummary;
}

// One click-to-edit part of the date/time: a small input reading "fri", "12 oct", "3pm", "1-2pm".
// Enter (or leaving it) saves what it understood; Esc puts it back; a value it can't read stays
// open, outlined, for fixing.
function WhenPart({ text, ghost, placeholder, title, save }: { text: string; ghost?: boolean; placeholder: string; title: string; save: (raw: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  if (draft === null) {
    return (
      <button type="button" className={`${styles.whenPart} ${ghost ? styles.ghostInline : ''}`} title={title} onClick={() => { setDraft(ghost ? '' : text); setInvalid(false); }}>
        {text}
      </button>
    );
  }
  const finish = (commit: boolean) => {
    if (commit && draft.trim() !== (ghost ? '' : text) && !save(draft)) { setInvalid(true); return; }
    setDraft(null);
  };
  return (
    <input
      className={`${styles.whenInput} ${invalid ? styles.whenInputInvalid : ''}`}
      value={draft}
      autoFocus
      size={Math.max(8, draft.length + 2)}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
      // Leaving it saves what it can read; anything else goes back to how it was.
      onBlur={() => { if (draft.trim() !== (ghost ? '' : text)) save(draft); setDraft(null); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(null); }
      }}
    />
  );
}

// A repeating item's dates, dropped down from its date: a few before the current one (faded once
// past) and the next several; each can be ticked (where the item has done) and opened in the
// calendar on its own — the calendar pane then offers "only this one / this and following". At the
// bottom, the series itself.
function OccurrenceList({ def, id, targetType, onClose }: { def: ArtifactTypeDef; id: string; targetType: string; onClose: () => void }) {
  const L = LABELS.noteObjects.link;
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(onClose);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const data = def.occurrences?.(id);
  if (!data) return null;
  return (
    <div ref={ref} className={styles.occurrences} role="listbox">
      <div className={styles.occurrencesRule}>{ITEM_FLAG_ICON.repeats} {data.rule}</div>
      {data.items.map((o) => (
        <div key={o.changedId ?? o.date} role="option" aria-selected={o.current} className={`${styles.occurrence} ${o.past && !o.current ? styles.occurrencePast : ''} ${o.current ? styles.occurrenceCurrent : ''}`}>
          {o.done !== null && (o.changedId ? def.toggleDone : def.toggleOccurrenceDone) && (
            <button
              type="button"
              className={styles.occurrenceDone}
              title={o.done ? L.markNotDone : L.markDone}
              onClick={() => (o.changedId ? def.toggleDone!(o.changedId) : def.toggleOccurrenceDone!(id, o.date))}
            >
              {o.done ? '☑' : '☐'}
            </button>
          )}
          <button
            type="button"
            className={styles.occurrenceDate}
            title={L.openThisOne}
            onClick={() => { openArtifactTarget(targetType, o.changedId ?? id, o.changedId ? undefined : o.date); onClose(); }}
          >
            {o.label}
          </button>
          {o.changedId && <span className={styles.occurrenceChanged}>{LABELS.calendarSeries.changed}</span>}
          {o.current && <span className={styles.occurrenceNext}>{L.nextOne}</span>}
        </div>
      ))}
      <button type="button" className={styles.occurrencesSeries} onClick={() => { openArtifactTarget(targetType, id); onClose(); }}>{L.openSeries} ↗</button>
    </div>
  );
}

// The expanded pane's second heading line, its first part: when (date and time, each
// click-to-edit — a repeating item's date drops down its list of dates instead), the options that
// are on apart from Important (which sits before the title) — each a click away from being turned
// off (Repeat asks first), after which it's offered greyed at the bottom again — and the item's
// state. The kind's Body puts the place, Endeavour and notification after it.
export function WhenLine({ def, id, targetType, summary }: Props) {
  const L = LABELS.noteObjects.link;
  // Opened straight away when the pane was expanded by a click on the inline pane's date.
  const [listOpen, setListOpen] = usePaneState('datesOpen', () => takeOccurrenceListRequest(`${targetType}:${id}`));
  const flags = (def.flags?.(id) ?? []).filter((f) => f.on && f.id !== 'important');
  // Done and past show by fading (the pane's state), so only these need words.
  const state = summary.state === 'overdue' ? L.overdue : summary.state === 'archived' ? L.archived : null;
  const series = summary.repeats && !!def.occurrences;
  const time = summary.timeLabel
    ? <WhenPart text={summary.timeLabel} placeholder={L.timePlaceholder} title={L.editTime} save={(raw) => def.editWhen!(id, 'time', raw)} />
    : <WhenPart text={L.addTime} ghost placeholder={L.timePlaceholder} title={L.editTime} save={(raw) => def.editWhen!(id, 'time', raw)} />;
  return (
    <>
      {summary.dateLabel && (series ? (
        <span className={`${styles.when} ${styles.seriesWhen}`}>
          <button type="button" className={styles.whenPart} title={L.seeDates} aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
            {summary.dateLabel} ▾
          </button>
          {def.editWhen && time}
          {listOpen && <OccurrenceList def={def} id={id} targetType={targetType} onClose={() => setListOpen(false)} />}
        </span>
      ) : def.editWhen ? (
        <span className={styles.when}>
          <WhenPart text={summary.dateLabel} placeholder={L.datePlaceholder} title={L.editDate} save={(raw) => def.editWhen!(id, 'date', raw)} />
          {time}
        </span>
      ) : <span className={styles.when}>{summary.when}</span>)}
      {flags.map((f) => (
        <button key={f.id} type="button" className={styles.onOption} title={L.removeOption(f.label)} onClick={f.toggle}>{f.icon}</button>
      ))}
      {state && <span className={`${styles.state} ${summary.state === 'overdue' ? styles.stateOverdue : ''}`}>{state}</span>}
    </>
  );
}

import { useId, useState } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useNoteStore } from '@/store/noteStore';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { DateInput } from '@/components/DateInput/DateInput';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { DisclosureIcon, TrashIcon } from '@/components/Icons';
import { iconText } from '@/components/IconPicker/iconValue';
import { STREAM_KINDS, STREAM_KIND_LIST } from '@/config/streamKinds';
import { pickableTypes } from '@/utils/itemTypes';
import { isPinnedNotebook } from '@/utils/notes';
import { newStream } from '@/utils/rhythms';
import { LABELS } from '@/config/labels';
import type { ItemTypeId, RepeatConfig, RhythmStream, ScheduleId, StreamKind, StreamVisibility } from '@/types';
import styles from './RhythmStreamsField.module.css';

// A rhythm's streams, in its edit pane (docs/features/endeavours.md screen E): each one's name,
// what it is (which sets where it shows), when (its own repeat, or N days from a timetable class),
// its Type, where it shows, and where its notes go. The routine's own stream (its id is the
// routine's) takes its days from the pane's Repeat, so they're not set twice.

const L = LABELS.rhythms;
const WEEKLY: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  streams:  RhythmStream[];
  ownId:    string;                  // the routine's id: its own stream's rule comes from the pane
  onChange: (streams: RhythmStream[]) => void;
}

export function RhythmStreamsField({ streams, ownId, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const patch = (id: string, p: Partial<RhythmStream>) => onChange(streams.map((s) => (s.id === id ? { ...s, ...p } : s)));

  return (
    <div className={styles.field}>
      <p className={styles.hint}>{L.streamsHint}</p>
      {streams.map((s) => (
        <StreamRow
          key={s.id}
          stream={s}
          own={s.id === ownId}
          open={open === s.id}
          onToggle={() => setOpen(open === s.id ? null : s.id)}
          onChange={(p) => patch(s.id, p)}
          onRemove={() => onChange(streams.filter((x) => x.id !== s.id))}
        />
      ))}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => { const s = newStream(); onChange([...streams, s]); setOpen(s.id); }}
      >
        {L.addStream}
      </button>
    </div>
  );
}

function StreamRow({ stream, own, open, onToggle, onChange, onRemove }: {
  stream: RhythmStream; own: boolean; open: boolean;
  onToggle: () => void; onChange: (p: Partial<RhythmStream>) => void; onRemove: () => void;
}) {
  const id = useId();
  const schedules = useScheduleStore((s) => s.schedules);
  const types = useItemTypeStore((s) => s.types);
  const noteTags = useNoteStore((s) => s.noteTags);
  const kind = STREAM_KINDS[stream.kind];
  const notebooks = Object.values(noteTags)
    .filter((t) => t.kind === 'area' && !isPinnedNotebook(t))
    .sort((a, b) => a.name.localeCompare(b.name));
  const classes = Object.values(schedules).filter((s) => s.active).flatMap((s) => s.blocks.map((b) => ({
    value: `${s.id}::${b.id}`,
    label: `${s.name}: ${b.title} (${b.daysOfWeek.map((d) => DAY_SHORT[d]).join('/')} ${b.startTime})`,
  })));
  const rule = stream.rule;
  const show = (p: Partial<StreamVisibility>) => onChange({ show: { ...stream.show, ...p } });

  return (
    <div className={styles.stream}>
      <div className={styles.head}>
        <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={open} aria-controls={id}>
          <DisclosureIcon open={open} />
          <span aria-hidden>{kind.icon}</span>
          <span className={styles.name}>{stream.label || L.labelPlaceholder}</span>
        </button>
        <button type="button" className={styles.iconBtn} onClick={onRemove} aria-label={L.removeStream} title={L.removeStream}>
          <TrashIcon width="1em" height="1em" />
        </button>
      </div>

      {open && (
        <div id={id} className={styles.body}>
          <label className={styles.row}>
            <span className={styles.label}>{L.label}</span>
            <input className={styles.input} value={stream.label} placeholder={L.labelPlaceholder} onChange={(e) => onChange({ label: e.target.value })} autoFocus={!stream.label} />
          </label>

          <label className={styles.row}>
            <span className={styles.label}>{L.kind}</span>
            <select
              className={styles.select}
              value={stream.kind}
              onChange={(e) => { const k = e.target.value as StreamKind; onChange({ kind: k, show: { ...STREAM_KINDS[k].show } }); }}
            >
              {STREAM_KIND_LIST.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
            </select>
          </label>
          <p className={styles.hint}>{kind.hint}</p>

          {!own && (
            <fieldset className={styles.group}>
              <legend className={styles.label}>{L.rule}</legend>
              <div className={styles.choice}>
                <label><input type="radio" checked={rule.kind === 'repeat'} onChange={() => onChange({ rule: { kind: 'repeat', repeat: WEEKLY } })} /> {L.ruleRepeat}</label>
                <label>
                  <input
                    type="radio"
                    checked={rule.kind === 'relative'}
                    disabled={classes.length === 0}
                    onChange={() => { const [sid, bid] = classes[0].value.split('::'); onChange({ rule: { kind: 'relative', scheduleId: sid as ScheduleId, blockId: bid, offsetDays: -1 } }); }}
                  /> {L.ruleRelative}
                </label>
              </div>
              {classes.length === 0 && <p className={styles.hint}>{L.noBlocks}</p>}
              {rule.kind === 'repeat' ? (
                <>
                  <RepeatField value={rule.repeat} onChange={(r) => onChange({ rule: { kind: 'repeat', repeat: r ?? rule.repeat } })} date={stream.start} onDateChange={(d) => onChange({ start: d })} />
                  <div className={styles.inline}>
                    <span className={styles.label}>{L.starts}</span>
                    <DateInput className={styles.input} value={stream.start} onChange={(v) => v && onChange({ start: v })} aria-label={L.starts} />
                    <span className={styles.label}>{L.time}</span>
                    <TimeInput className={styles.input} value={stream.time ?? ''} onChange={(v) => onChange({ time: v || null })} placeholder={L.time} />
                  </div>
                </>
              ) : (
                <div className={styles.inline}>
                  <select
                    className={styles.select}
                    aria-label={L.block}
                    value={`${rule.scheduleId}::${rule.blockId}`}
                    onChange={(e) => { const [sid, bid] = e.target.value.split('::'); onChange({ rule: { kind: 'relative', offsetDays: rule.offsetDays, scheduleId: sid as ScheduleId, blockId: bid } }); }}
                  >
                    {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input
                    className={styles.small}
                    type="number"
                    aria-label={L.offset}
                    value={rule.offsetDays}
                    onChange={(e) => onChange({ rule: { ...rule, offsetDays: Math.round(Number(e.target.value) || 0) } })}
                  />
                  <span className={styles.hint}>{L.offsetWords(rule.offsetDays)}</span>
                  {rule.blockIds?.length ? <span className={styles.hint}>{L.moreClasses(rule.blockIds.length)}</span> : null}
                </div>
              )}
            </fieldset>
          )}

          <label className={styles.row}>
            <span className={styles.label}>{L.type}</span>
            <select className={styles.select} value={stream.typeId ?? ''} onChange={(e) => onChange({ typeId: (e.target.value || null) as ItemTypeId | null })}>
              <option value="">{LABELS.itemTypes.none}</option>
              {pickableTypes(types, stream.typeId).map((t) => <option key={t.id} value={t.id}>{[iconText(t.icon), t.name].filter(Boolean).join(' ')}</option>)}
            </select>
          </label>

          <fieldset className={styles.group}>
            <legend className={styles.label}>{L.showsOn}</legend>
            <label className={styles.row}>
              <span className={styles.label}>{L.calendar}</span>
              <select className={styles.select} value={stream.show.calendar} onChange={(e) => show({ calendar: e.target.value as StreamVisibility['calendar'] })}>
                {(['none', 'marker', 'item'] as const).map((m) => <option key={m} value={m}>{L.calendarModes[m]}</option>)}
              </select>
            </label>
            <label className={styles.row}>
              <span className={styles.label}>{L.tasks}</span>
              <select className={styles.select} value={stream.show.tasks} onChange={(e) => show({ tasks: e.target.value as StreamVisibility['tasks'] })}>
                {(['never', 'near', 'always'] as const).map((m) => <option key={m} value={m}>{L.tasksModes[m]}</option>)}
              </select>
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={stream.show.notify} onChange={(e) => show({ notify: e.target.checked })} /> {L.notify}
            </label>
          </fieldset>

          <label className={styles.row}>
            <span className={styles.label}>{L.notesTo}</span>
            <select className={styles.select} value={stream.notebookId ?? ''} onChange={(e) => onChange({ notebookId: e.target.value || null })}>
              <option value="">{L.notesNowhere}</option>
              {notebooks.map((n) => <option key={n.id} value={n.id}>{iconText(n.icon, '📓')} {n.name}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

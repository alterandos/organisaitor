import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LABELS } from '@/config/labels';
import type { NotifyUnit } from '@/types';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { DEFAULT_NOTIFY_AT, defaultRule, fitRule, ruleKindsFor, type NotifyRule } from '@/utils/notifyRule';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import styles from './AllDayNotifyField.module.css';

const L = LABELS.calendarForm;

export interface LeadPreset { label: string; apply: () => void; active?: boolean }

// A number typed straight in, with a ▾ list of the usual choices beside it. Typing keeps what's
// typed while it isn't a valid amount yet (an empty box, mid-edit), and goes back to the stored
// amount on leaving it.
export function LeadAmountInput({ value, min, onChange, presets, ariaLabel }: {
  value: number; min: number; onChange: (n: number) => void; presets: LeadPreset[]; ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) { setPrevValue(value); setDraft(String(value)); }
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { ref: listRef, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 4, align: 'end' });
  const open = anchor !== null;

  useEscapeClose(() => setAnchor(null), open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || toggleRef.current?.contains(t)) return;
      setAnchor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, listRef]);

  const type = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setDraft(cleaned);
    if (cleaned !== '' && Number(cleaned) >= min) onChange(Number(cleaned));
  };

  const toggle = () => {
    if (open) { setAnchor(null); return; }
    const r = toggleRef.current?.closest(`.${styles.amount}`)?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };

  return (
    <span className={styles.amount}>
      <input
        type="text"
        inputMode="numeric"
        className={styles.amountInput}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setDraft(String(value))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          onChange(Math.max(min, value + (e.key === 'ArrowUp' ? 1 : -1)));
        }}
      />
      <button ref={toggleRef} type="button" className={styles.amountToggle} aria-label={L.notifyPresets} aria-expanded={open} onClick={toggle}>▾</button>
      {open && createPortal(
        <div ref={listRef} className={styles.presets} style={style} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              role="option"
              aria-selected={p.active ?? false}
              className={`${styles.preset} ${p.active ? styles.presetActive : ''}`}
              onClick={() => { p.apply(); setAnchor(null); }}
            >
              {p.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}

const UNITS: NotifyUnit[] = ['minutes', 'hours', 'days'];
const BEFORE_PRESETS: [number, NotifyUnit][] = [[5, 'minutes'], [10, 'minutes'], [15, 'minutes'], [30, 'minutes'], [1, 'hours'], [2, 'hours'], [1, 'days'], [2, 'days'], [7, 'days']];
const DAY_PRESETS = [0, 1, 2, 3, 7, 14];

type Item = 'event' | 'reminder' | 'deadline';
type Choice = 'atTime' | `before:${NotifyUnit}` | 'daysAt';
const choiceOf = (rule: NotifyRule): Choice => (rule.kind === 'before' ? `before:${rule.unit}` : rule.kind === 'daysAt' ? 'daysAt' : 'atTime');

// THE notify setting of a calendar item, without its on/off box (utils/notifyRule.ts holds the rules):
// on one line, an amount and what it counts ("2 | hours before", "1 | days before, at | 17:00"),
// or "at its time" for a timed reminder. An item with no time offers only days before, at a time.
export function NotifyRuleEditor({ item, timed, rule, onChange }: { item: Item; timed: boolean; rule: Exclude<NotifyRule, { kind: 'off' }>; onChange: (rule: NotifyRule) => void }) {
  const kinds = ruleKindsFor(item, timed);
  const choices: Choice[] = kinds.flatMap((k): Choice[] => (k === 'before' ? UNITS.map((u) => `before:${u}` as Choice) : [k]));
  const pick = (c: Choice) => {
    if (c === 'atTime') onChange({ kind: 'atTime' });
    else if (c === 'daysAt') onChange({ kind: 'daysAt', days: rule.kind === 'daysAt' ? rule.days : 1, at: rule.kind === 'daysAt' ? rule.at : DEFAULT_NOTIFY_AT });
    else onChange({ kind: 'before', value: rule.kind === 'before' ? rule.value : 1, unit: c.slice(7) as NotifyUnit });
  };
  return (
    <span className={styles.row}>
      {rule.kind === 'before' && (
        <LeadAmountInput value={rule.value} min={1} ariaLabel={L.notifyAmount}
          onChange={(n) => onChange({ ...rule, value: n })}
          presets={BEFORE_PRESETS.map(([n, u]) => ({ label: L.beforePreset(n, u), active: n === rule.value && u === rule.unit, apply: () => onChange({ kind: 'before', value: n, unit: u }) }))} />
      )}
      {rule.kind === 'daysAt' && (
        <LeadAmountInput value={rule.days} min={0} ariaLabel={L.daysBefore}
          onChange={(n) => onChange({ ...rule, days: n })}
          presets={DAY_PRESETS.map((n) => ({ label: L.daysBeforeLabel(n), active: n === rule.days, apply: () => onChange({ ...rule, days: n }) }))} />
      )}
      {choices.length > 1 ? (
        <select className={styles.select} value={choiceOf(rule)} aria-label={L.notifyUnit} onChange={(e) => pick(e.target.value as Choice)}>
          {choices.map((c) => <option key={c} value={c}>{c === 'atTime' ? L.atItsTimeOption : c === 'daysAt' ? L.daysBeforeAt : L.before[c.slice(7) as NotifyUnit]}</option>)}
        </select>
      ) : (
        <span className={styles.at}>{rule.kind === 'daysAt' ? L.daysBeforeSuffix(rule.days) : ''}</span>
      )}
      {rule.kind === 'daysAt' && (
        <span className={styles.row}>
          {choices.length === 1 && <span className={styles.at}>{L.at}</span>}
          <TimeInput className={styles.time} value={rule.at} onChange={(v) => onChange({ ...rule, at: v || rule.at })} />
        </span>
      )}
    </span>
  );
}

// "Notify me" and the setting, for every calendar item: the new item window and the event,
// reminder and deadline panes. Off, nothing more shows; switched on, it starts from the usual rule
// for the item (defaultRule).
export function NotifyRuleField({ item, timed, rule, onChange, labelClassName }: {
  item: Item; timed: boolean; rule: NotifyRule; onChange: (rule: NotifyRule) => void; labelClassName?: string;
}) {
  const shown = fitRule(rule, item, timed);
  return (
    <div className={styles.field}>
      <label className={labelClassName ?? styles.check}>
        <input type="checkbox" checked={shown.kind !== 'off'} onChange={(e) => onChange(e.target.checked ? defaultRule(item, timed) : { kind: 'off' })} />
        {L.notifyMe}
      </label>
      {shown.kind !== 'off' && <NotifyRuleEditor item={item} timed={timed} rule={shown} onChange={onChange} />}
    </div>
  );
}

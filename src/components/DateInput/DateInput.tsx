import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LABELS } from '@/config/labels';
import { todayIso } from '@/utils/date';
import { focusNextAfter } from '@/utils/focusNext';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useWheelSteps } from '@/hooks/useWheelSteps';
import { CloseIcon } from '@/components/Icons';
import { MiniDatePicker } from '@/components/MiniDatePicker/MiniDatePicker';
import { SegmentStepper } from '@/components/TimeInput/SegmentStepper';
import segStyles from '@/components/TimeInput/TimeInput.module.css';
import styles from './DateInput.module.css';

interface Props {
  value:       string;                 // YYYY-MM-DD, '' = unset
  onChange:    (value: string) => void;
  className?:  string;
  'aria-label'?: string;
  min?:        string;                 // YYYY-MM-DD: a date before it becomes it
  required?:   boolean;
  id?:         string;                 // on the first segment, so a <label htmlFor> still finds the field
}

type Part = 'day' | 'month' | 'year';
const L = LABELS.dateInput;

// The day, month and year in this computer's order, with the separator it uses ("22/10/2026").
function localeOrder(): { order: Part[]; sep: string } {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(2001, 10, 22));
    const order = parts.map((p) => p.type).filter((t): t is Part => t === 'day' || t === 'month' || t === 'year');
    const sep = parts.find((p) => p.type === 'literal')?.value.trim() || '/';
    return order.length === 3 ? { order, sep } : { order: ['day', 'month', 'year'], sep: '/' };
  } catch {
    return { order: ['day', 'month', 'year'], sep: '/' };   // no Intl parts (very old engines)
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number, month: number) => new Date(year || 2000, month, 0).getDate();
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { year: m[1], month: m[2], day: m[3] } : { year: '', month: '', day: '' };
};

// THE date field for the whole suite (every date the person enters; the pattern test allows no
// native type="date": it follows the browser's locale picker, not the app, and can't be stepped).
// Built like TimeInput, with the same rules (agreed with the user 2026-10-22; the year fills in, 2026-10-30):
//   • day, month and year typed on their own, in the computer's order, in any order; an
//     incomplete date is reported as '' upward, but what's typed stays;
//   • too big a day or month becomes the largest allowed, selected (32 → 31 or the month's last
//     day; 13 → 12); a complete segment moves on by itself (a digit nothing can follow, "4" in a
//     day, at once), and after the year, on to the next control;
//   • Tab / Shift+Tab and ← → between segments; ↑↓, the wheel and the hover ▲▼ step a segment;
//   • ▾ opens the go-to-date picker (MiniDatePicker), Delete clears.
export function DateInput({ value, onChange, className, min, required, id, 'aria-label': ariaLabel }: Props) {
  const [{ order, sep }] = useState(localeOrder);
  const [seg, setSeg] = useState(() => parse(value));
  const [emitted, setEmitted] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (value !== emitted) setSeg(parse(value));
    setEmitted(value);
  }
  const [flash, setFlash] = useState<Part | null>(null);
  const [picker, setPicker] = useState<AnchorBox | null>(null);
  const refs = { day: useRef<HTMLInputElement>(null), month: useRef<HTMLInputElement>(null), year: useRef<HTMLInputElement>(null) };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fresh = useRef<Part | null>(null);
  const skipBlur = useRef(false);

  const emit = (v: string) => { setEmitted(v); onChange(v); };
  // Once the day and month are in and the year isn't, it's this year (2026-10-30, the user: typing
  // "2026" every time is four keys for nothing). It's selected when the year is reached, so typing
  // replaces it and Tab goes past it. Never while the year itself is being edited, so it can be cleared.
  const commit = (input: typeof seg, fillYear = true) => {
    const next = fillYear && !input.year && input.day.length === 2 && input.month.length === 2 ? { ...input, year: todayIso().slice(0, 4) } : input;
    setSeg(next);
    const y = Number(next.year); const m = Number(next.month); const d = Number(next.day);
    if (next.year.length === 4 && next.month.length === 2 && next.day.length === 2 && m >= 1 && m <= 12 && d >= 1) {
      let iso = `${next.year}-${next.month}-${pad2(Math.min(d, daysIn(y, m)))}`;
      if (min && iso < min) iso = min;
      emit(iso);
    } else if (emitted !== '') emit('');
  };
  const flashPart = (p: Part) => { setFlash(p); setTimeout(() => setFlash((f) => (f === p ? null : f)), 420); };
  const focusPart = (p: Part) => {
    skipBlur.current = true;
    refs[p].current?.focus();
    refs[p].current?.select();
    skipBlur.current = false;
  };
  const nextOf = (p: Part) => order[order.indexOf(p) + 1];
  const prevOf = (p: Part) => order[order.indexOf(p) - 1];
  const moveOn = (p: Part) => {
    const n = nextOf(p);
    if (n) { focusPart(n); return; }
    if (wrapperRef.current) { skipBlur.current = true; focusNextAfter(wrapperRef.current); skipBlur.current = false; }
  };

  const today = parse(todayIso());
  const step = (p: Part, dir: 1 | -1) => {
    const base = { ...today, ...Object.fromEntries(Object.entries(seg).filter(([, v]) => v !== '')) } as typeof seg;
    const y = Number(base.year); const m = Number(base.month); const d = Number(base.day);
    const next = { ...base };
    if (p === 'year') next.year = String(Math.max(1, Math.min(9999, y + dir))).padStart(4, '0');
    if (p === 'month') next.month = pad2(((m - 1 + dir + 12) % 12) + 1);
    if (p === 'day') { const n = daysIn(y, m); next.day = pad2(((d - 1 + dir + n) % n) + 1); }
    if (p !== 'day' && Number(next.day) > daysIn(Number(next.year), Number(next.month))) next.day = pad2(daysIn(Number(next.year), Number(next.month)));
    commit(next);
  };
  useWheelSteps(order.map((p) => refs[p]), (i, dir) => step(order[i], dir));

  useEscapeClose(() => setPicker(null), !!picker);

  const onKey = (p: Part) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const wasFresh = fresh.current === p;
    fresh.current = null;
    if (e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Delete' || (e.key === 'Backspace' && wasFresh && seg[p] !== '')) { e.preventDefault(); clear(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); commit({ ...seg, [p]: seg[p].slice(0, -1) }, p !== 'year'); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step(p, e.key === 'ArrowUp' ? 1 : -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); const n = nextOf(p); if (n) focusPart(n); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); const n = prevOf(p); if (n) focusPart(n); return; }
    if (e.key === 'Enter') { e.preventDefault(); moveOn(p); return; }
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (!/^[0-9]$/.test(e.key)) {
      // Typing the separator finishes a one-digit day or month ("4/").
      if ((e.key === sep || '/.-'.includes(e.key)) && p !== 'year' && seg[p].length === 1 && seg[p] !== '0') { commit({ ...seg, [p]: pad2(Number(seg[p])) }); moveOn(p); }
      return;
    }
    const buffer = (wasFresh || seg[p].length >= (p === 'year' ? 4 : 2) ? '' : seg[p]) + e.key;
    if (p === 'year') {
      commit({ ...seg, year: buffer }, false);
      if (buffer.length === 4) moveOn(p);
      return;
    }
    const max = p === 'month' ? 12 : (seg.month.length === 2 ? daysIn(Number(seg.year), Number(seg.month)) : 31);
    const n = Number(buffer);
    if (buffer.length === 2 && (n > max || n === 0)) {
      commit({ ...seg, [p]: pad2(n === 0 ? 1 : max) });
      flashPart(p);
      fresh.current = p;
      requestAnimationFrame(() => refs[p].current?.select());
      return;
    }
    const complete = buffer.length === 2 || (n !== 0 && n * 10 > (p === 'month' ? 12 : 31));
    if (!complete) { setSeg({ ...seg, [p]: buffer }); return; }
    commit({ ...seg, [p]: pad2(n) });
    moveOn(p);
  };

  const onBlur = (p: Part) => () => {
    if (skipBlur.current || seg[p] === '') return;
    if (p === 'year' && seg.year.length === 2) commit({ ...seg, year: `20${seg.year}` }, false);
    else if (p !== 'year' && seg[p].length === 1 && seg[p] !== '0') commit({ ...seg, [p]: pad2(Number(seg[p])) });
  };

  const clear = () => { setSeg({ year: '', month: '', day: '' }); emit(''); setPicker(null); };

  const openPicker = () => {
    if (picker) { setPicker(null); return; }
    const r = wrapperRef.current?.getBoundingClientRect();
    if (r) setPicker({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };

  const placeholder: Record<Part, string> = { day: L.dd, month: L.mm, year: L.yyyy };
  const label: Record<Part, string> = { day: L.day, month: L.month, year: L.year };

  return (
    <div ref={wrapperRef} className={`${className ?? ''} ${segStyles.wrapper} ${styles.wrapper}`} role="group" aria-label={ariaLabel}>
      {order.map((p, i) => (
        <span key={p} className={styles.part}>
          {i > 0 && <span className={segStyles.sep}>{sep}</span>}
          <span className={segStyles.segWrap}>
            <input
              ref={refs[p]}
              id={i === 0 ? id : undefined}
              type="text"
              inputMode="numeric"
              className={`${segStyles.segment} ${p === 'year' ? styles.year : ''} ${flash === p ? segStyles.segmentError : ''}`}
              value={seg[p]}
              placeholder={placeholder[p]}
              aria-label={label[p]}
              aria-required={required || undefined}
              onFocus={(e) => { e.currentTarget.select(); fresh.current = p; }}
              onKeyDown={onKey(p)}
              onBlur={onBlur(p)}
              onChange={() => {}}
            />
            <SegmentStepper label={label[p].toLowerCase()} onUp={() => step(p, 1)} onDown={() => step(p, -1)} />
          </span>
        </span>
      ))}
      {value && (
        <button type="button" tabIndex={-1} className={segStyles.clearBtn} aria-label={L.clear} onClick={clear}><CloseIcon /></button>
      )}
      <button type="button" tabIndex={-1} className={segStyles.dropdownToggle} aria-label={L.choose} aria-expanded={!!picker}
        onMouseDown={(e) => e.preventDefault()} onClick={openPicker}>▾</button>
      {picker && (
        <DatePopover anchor={picker} value={value || todayIso()} onPick={(d) => { emit(min && d < min ? min : d); setSeg(parse(min && d < min ? min : d)); }} onClose={() => setPicker(null)} wrapper={wrapperRef} />
      )}
    </div>
  );
}

// The calendar under the field (▾): browsing by month or year doesn't change the field; picking a day does, and closes it.
function DatePopover({ anchor, value, onPick, onClose, wrapper }: {
  anchor: AnchorBox; value: string; onPick: (d: string) => void; onClose: () => void; wrapper: React.RefObject<HTMLDivElement | null>;
}) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 4 });
  const [browsing, setBrowsing] = useState(value);
  // The day just picked, read by the click that bubbles up from it (state would still be the old one).
  const latest = useRef(value);
  const browse = (d: string) => { latest.current = d; setBrowsing(d); };
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || wrapper.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, ref, wrapper]);
  return createPortal(
    <div ref={ref} className={styles.popover} style={style} onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { if ((e.target as Element).closest('[data-picker-day]')) { onPick(latest.current); onClose(); } }}>
      <MiniDatePicker anchorDate={browsing} onSelect={browse} />
    </div>,
    document.body,
  );
}

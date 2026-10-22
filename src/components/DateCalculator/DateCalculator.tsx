import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { DateInput } from '@/components/DateInput/DateInput';
import { MagicWandButton, MagicWandPanel } from '@/components/MagicWand/MagicWand';
import { CloseIcon, DateCalcIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { CALC_UNITS, between, countFrom, readDateCalc, type CalcUnit } from '@/utils/dateCalc';
import { todayIso } from '@/utils/date';
import { log } from '@/utils/log';
import { LABELS } from '@/config/labels';
import styles from './DateCalculator.module.css';

const L = LABELS.dateCalc;
type Mode = 'count' | 'between';

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// The date calculator (a Place; also the Calendar header's button): a date that's hard to work
// out in your head. Count on or back from a date (days, weeks, months, years, working days, or
// "the 12th Friday"), or the time between two dates. Fields to fill in, or the magic wand to ask
// in words (utils/dateCalc.ts readDateCalc). The answer updates as you type; Ctrl+Enter shows it
// in the Calendar.
export function DateCalculator() {
  const close = useUIStore((s) => s.closeDateCalculator);
  const today = todayIso();
  const [mode, setMode] = useState<Mode>('count');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<CalcUnit>('days');
  const [dir, setDir] = useState<1 | -1>(1);
  const [wandOpen, setWandOpen] = useState(false);

  useEscapeClose(close);
  useCtrlEnterSubmit(() => showInCalendar());

  const n = Math.max(0, Math.floor(Number(amount)));
  const valid = mode === 'count' ? !!from && Number.isFinite(n) : !!from && !!to;
  const result = !valid ? null : mode === 'count' ? countFrom(from, n, unit, dir) : null;
  const span = valid && mode === 'between' ? between(from, to) : null;
  const target = result ?? (span ? to : null);

  function readText(text: string): boolean {
    const c = readDateCalc(text);
    if (!c) return false;
    setMode(c.kind);
    setFrom(c.from);
    if (c.kind === 'count') { setAmount(String(c.n)); setUnit(c.unit); setDir(c.dir); }
    else setTo(c.to);
    return true;
  }

  function showInCalendar() {
    if (!target) return;
    const ui = useUIStore.getState();
    ui.setActiveView('calendar');
    ui.requestCalendarDate(target);
    close();
  }

  function copy() {
    const text = result ? longDate(result) : span ? L.span(Math.abs(span.days), span.weeks, span.rest) : '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => showToast({ message: L.copied(text) }),
      (e) => log.warn('dateCalc', 'copy failed', e),
    );
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.modal} role="dialog" aria-label={L.title}>
        <div className={styles.header}>
          <span className={styles.title}><DateCalcIcon aria-hidden="true" /> {L.title}</span>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label={L.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <div className={styles.topRow}>
            <MagicWandButton open={wandOpen} onToggle={() => setWandOpen((v) => !v)} />
            <div className={styles.modes} role="tablist" aria-label={L.title}>
              {(['count', 'between'] as Mode[]).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} className={`${styles.mode} ${mode === m ? styles.modeOn : ''}`} onClick={() => setMode(m)}>
                  {L.modes[m]}
                </button>
              ))}
            </div>
          </div>
          {wandOpen && <MagicWandPanel hint={L.wandHint} onRead={readText} onClose={() => setWandOpen(false)} />}

          <div className={styles.field}>
            <span className={styles.label}>{L.from}</span>
            <div className={styles.row}>
              <DateInput value={from} onChange={setFrom} aria-label={L.from} />
              {from !== today && <button type="button" className={styles.link} onClick={() => setFrom(today)}>{L.today}</button>}
            </div>
          </div>

          {mode === 'count' ? (
            <div className={styles.row}>
              <input className={styles.amount} type="number" min={0} inputMode="numeric" value={amount} aria-label={L.amount} onChange={(e) => setAmount(e.target.value)} />
              <select className={styles.select} value={unit} aria-label={L.unit} onChange={(e) => setUnit(e.target.value as CalcUnit)}>
                {CALC_UNITS.map((u) => <option key={u} value={u}>{L.units[u]}</option>)}
              </select>
              <select className={styles.select} value={dir} aria-label={L.direction} onChange={(e) => setDir(Number(e.target.value) as 1 | -1)}>
                <option value={1}>{L.dirs.after}</option>
                <option value={-1}>{L.dirs.before}</option>
              </select>
            </div>
          ) : (
            <div className={styles.field}>
              <span className={styles.label}>{L.to}</span>
              <DateInput value={to} onChange={setTo} aria-label={L.to} />
            </div>
          )}

          <output className={styles.result} aria-live="polite">
            {result && (
              <>
                <span className={styles.answer}>{longDate(result)}</span>
                <span className={styles.detail}>{L.away(between(today, result).days)}</span>
              </>
            )}
            {span && (
              <>
                <span className={styles.answer}>{L.span(Math.abs(span.days), span.weeks, span.rest)}</span>
                <span className={styles.detail}>{L.workdays(Math.abs(span.workdays))}{span.days < 0 ? ` · ${L.earlier}` : ''}</span>
              </>
            )}
          </output>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={copy} disabled={!target}>{L.copy}</button>
            <button type="button" className={styles.primary} onClick={showInCalendar} disabled={!target}>{L.showInCalendar}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

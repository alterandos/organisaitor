import { useEffect, useRef } from 'react';
import { useConverterStore } from '@/store/converterStore';
import { ConverterIcon } from '@/components/Icons';
import { UNIT_CATEGORIES, unitCategory } from '@/config/units';
import { convertUnit, readAmount, runConverter, runConverterBack, showAmount, worksBothWays } from '@/utils/convert';
import { defaultUnits, type ConvertDesign, type ConvertValue } from './convertValue';
import { LABELS } from '@/config/labels';
import type { ConverterId } from '@/types/converters';
import styles from './ConvertWidget.module.css';

const L = LABELS.converters;

// One conversion, shown and worked out where it's put (the note block `\convert`, and any later
// host): which converter, its units and the amount typed. Only those are stored; the answer is
// worked out each time it's drawn, so it's always right, and a custom converter edited later is
// followed. A host stores what `onChange` gives it. Two designs: Card (a heading with the
// converter's name, the conversion below) and Compact (one row).

export function ConvertWidget({ value, design, editable, onChange, focusSignal, onEscape }: {
  value: ConvertValue;
  design: ConvertDesign;
  editable: boolean;
  onChange: (v: ConvertValue) => void;
  focusSignal?: { n: number; text: string };
  onEscape?: () => void;
}) {
  const customs = useConverterStore((s) => s.converters);
  const firstInput = useRef<HTMLInputElement>(null);
  const cat = unitCategory(value.converter);
  const custom = cat ? null : customs[value.converter as ConverterId] ?? null;
  const set = (patch: Partial<ConvertValue>) => onChange({ ...value, ...patch });

  // The block was asked for the keyboard (typed on while selected, or Enter): the first field
  // takes it, with what was typed.
  useEffect(() => {
    if (!focusSignal?.n) return;
    const el = firstInput.current;
    if (!el) return;
    el.focus();
    if (focusSignal.text) {
      const key = cat ? 'amount' : custom?.inputs[0]?.key;
      if (key) onChange({ ...value, values: { ...value.values, [key]: focusSignal.text } });
    } else el.select();
    // Only a new request moves the focus, not a changed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal?.n]);

  const keys = (e: React.KeyboardEvent) => { if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); } };

  const picker = (
    <select className={styles.picker} value={value.converter} disabled={!editable} aria-label={L.title} title={L.title}
      onChange={(e) => {
        const id = e.target.value;
        const units = unitCategory(id);
        onChange({ converter: id, ...(units ? defaultUnits(id) : { from: null, to: null }), values: units ? { amount: value.values.amount ?? '1' } : {}, reverse: false });
      }}>
      <optgroup label={L.builtIn}>{UNIT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{L.categories[c.id]}</option>)}</optgroup>
      {Object.keys(customs).length > 0 && (
        <optgroup label={L.custom}>{Object.values(customs).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
      )}
      {!cat && !custom && <option value={value.converter}>{L.gone}</option>}
    </select>
  );

  let body: React.ReactNode = <span className={styles.gone}>{L.gone}</span>;
  if (cat) {
    const d = defaultUnits(cat.id);
    const fromId = value.from ?? d.from, toId = value.to ?? d.to;
    const from = cat.units.find((u) => u.id === fromId) ?? cat.units[0];
    const to = cat.units.find((u) => u.id === toId) ?? cat.units[1];
    const n = readAmount(value.values.amount ?? '');
    const unitSelect = (id: string, which: 'from' | 'to') => (
      <select className={styles.unit} value={id} disabled={!editable} aria-label={which === 'from' ? L.from : L.to} onChange={(e) => set({ [which]: e.target.value })}>
        {cat.units.map((u) => <option key={u.id} value={u.id} title={u.name}>{u.symbol}</option>)}
      </select>
    );
    body = (
      <>
        <span className={styles.side}>
          <input ref={firstInput} className={styles.amount} value={value.values.amount ?? ''} inputMode="decimal" readOnly={!editable} aria-label={L.amount}
            size={Math.max(3, (value.values.amount ?? '').length + 1)} onKeyDown={keys}
            onChange={(e) => set({ values: { ...value.values, amount: e.target.value } })} />
          {unitSelect(from.id, 'from')}
        </span>
        <button type="button" className={styles.swap} disabled={!editable} onClick={() => set({ from: to.id, to: from.id })} aria-label={L.swap} title={L.swap}><ConverterIcon /></button>
        <span className={styles.side}>
          <output className={styles.result}>{showAmount(Number.isFinite(n) ? convertUnit(n, from, to) : NaN)}</output>
          {unitSelect(to.id, 'to')}
        </span>
      </>
    );
  } else if (custom) {
    const back = value.reverse && worksBothWays(custom);
    const ins = back ? [custom.output] : custom.inputs;
    const out = back ? custom.inputs[0] : custom.output;
    const nums = Object.fromEntries(ins.map((i) => [i.key, readAmount(value.values[i.key] ?? '')]));
    const result = back ? runConverterBack(custom, nums[custom.output.key]) : runConverter(custom, nums);
    body = (
      <>
        <span className={styles.side}>
          {ins.map((i, k) => (
            <label key={i.key} className={styles.field}>
              {(ins.length > 1 || design === 'card') && <span className={styles.fieldLabel}>{i.label || i.key}</span>}
              <span className={styles.side}>
                <input ref={k === 0 ? firstInput : undefined} className={styles.amount} value={value.values[i.key] ?? ''} inputMode="decimal" readOnly={!editable}
                  aria-label={i.label || i.key} size={Math.max(3, (value.values[i.key] ?? '').length + 1)} onKeyDown={keys}
                  onChange={(e) => set({ values: { ...value.values, [i.key]: e.target.value } })} />
                <span className={styles.unitText}>{i.unit}</span>
              </span>
            </label>
          ))}
        </span>
        {worksBothWays(custom)
          ? <button type="button" className={styles.swap} disabled={!editable} onClick={() => set({ reverse: !value.reverse, values: { [out.key]: showAmount(result).replace(/,/g, '') } })} aria-label={L.swap} title={L.swap}><ConverterIcon /></button>
          : <span className={styles.arrow} aria-hidden="true">→</span>}
        <label className={styles.field}>
          {design === 'card' && <span className={styles.fieldLabel}>{out.label || out.key}</span>}
          <span className={styles.side}>
            <output className={styles.result}>{showAmount(result)}</output>
            <span className={styles.unitText}>{out.unit}</span>
          </span>
        </label>
      </>
    );
  }

  return design === 'card' ? (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.kind}>{L.noteKind}</span>
        {picker}
      </div>
      <div className={styles.row}>{body}</div>
    </div>
  ) : (
    <div className={styles.compact}>
      {picker}
      <span className={styles.rule} aria-hidden="true" />
      <div className={styles.row}>{body}</div>
    </div>
  );
}

import { useState } from 'react';
import { useConverterStore } from '@/store/converterStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { TrashIcon } from '@/components/Icons';
import { FORMULA_FUNCTIONS, formulaError } from '@/utils/formula';
import { runConverter, showAmount } from '@/utils/convert';
import { LABELS } from '@/config/labels';
import type { ConverterField, ConverterId, CustomConverter } from '@/types/converters';
import styles from './ConverterPane.module.css';

const L = LABELS.converters.editor;
const RESERVED = new Set([...FORMULA_FUNCTIONS, 'pi', 'e']);
const blankField = (key: string): ConverterField => ({ key, label: '', unit: '' });

// Making or changing one of the person's own converters (types/converters.ts): its inputs, its
// output, the formula (utils/formula.ts: mathjs syntax, checked as you type), and for a one-input
// converter an optional formula back. A try-out line shows what it gives for 1 of each input.
// Escape cancels the edit (not the panel); Ctrl+Enter saves.
export function ConverterEditor({ converter, onDone }: { converter: CustomConverter | null; onDone: (id: ConverterId | null) => void }) {
  const [name, setName] = useState(converter?.name ?? '');
  const [icon, setIcon] = useState(converter?.icon ?? '');
  const [inputs, setInputs] = useState<ConverterField[]>(converter?.inputs ?? [blankField('x')]);
  const [output, setOutput] = useState<ConverterField>(converter?.output ?? blankField('y'));
  const [formula, setFormula] = useState(converter?.formula ?? '');
  const [inverse, setInverse] = useState(converter?.inverse ?? '');

  useEscapeClose(() => onDone(null));
  useCtrlEnterSubmit(() => save());

  const keys = [...inputs.map((i) => i.key.trim()), output.key.trim()];
  const keyProblem = keys.some((k) => !/^[A-Za-z_]\w*$/.test(k) || RESERVED.has(k)) ? L.badKey
    : new Set(keys).size !== keys.length ? L.dupKey : null;
  const inputKeys = inputs.map((i) => i.key.trim());
  const formulaProblem = formula.trim() || converter ? formulaError(formula, inputKeys) : null;
  const oneInput = inputs.length === 1;
  const inverseProblem = oneInput && inverse.trim() ? formulaError(inverse, [output.key.trim()]) : null;
  const valid = !!name.trim() && !keyProblem && !!formula.trim() && !formulaProblem && !inverseProblem;

  const draft: CustomConverter = {
    id: (converter?.id ?? 'draft') as ConverterId, name: name.trim(), icon: icon.trim() || null,
    inputs: inputs.map((i) => ({ ...i, key: i.key.trim() })), output: { ...output, key: output.key.trim() },
    formula: formula.trim(), inverse: oneInput && inverse.trim() ? inverse.trim() : null,
    createdAt: converter?.createdAt ?? '', updatedAt: '',
  };
  const sample = valid ? runConverter(draft, Object.fromEntries(draft.inputs.map((i) => [i.key, 1]))) : NaN;

  function save() {
    if (!valid) return;
    const fields = { name: draft.name, icon: draft.icon, inputs: draft.inputs, output: draft.output, formula: draft.formula, inverse: draft.inverse };
    const store = useConverterStore.getState();
    if (converter) { store.updateConverter(converter.id, fields); onDone(converter.id); }
    else onDone(store.addConverter(fields));
  }

  const setInput = (n: number, patch: Partial<ConverterField>) => setInputs((list) => list.map((f, k) => (k === n ? { ...f, ...patch } : f)));
  const nextKey = () => ['x', 'y', 'z', 'a', 'b', 'c', 'd'].find((k) => !keys.includes(k)) ?? `in${inputs.length + 1}`;

  const fieldRow = (f: ConverterField, change: (p: Partial<ConverterField>) => void, remove?: () => void) => (
    <div className={styles.editRow}>
      <input className={styles.keyInput} value={f.key} aria-label={L.key} title={L.key} onChange={(e) => change({ key: e.target.value })} />
      <input className={styles.textInput} value={f.label} placeholder={L.label} aria-label={L.label} onChange={(e) => change({ label: e.target.value })} />
      <input className={styles.unitInput} value={f.unit} placeholder={L.unit} aria-label={L.unit} onChange={(e) => change({ unit: e.target.value })} />
      {remove && <button type="button" className={styles.iconBtn} onClick={remove} aria-label={L.removeInput} title={L.removeInput}><TrashIcon width="1em" height="1em" /></button>}
    </div>
  );

  return (
    <div className={styles.view}>
      <h3 className={styles.viewTitle}>{converter ? L.editTitle : L.newTitle}</h3>
      <div className={styles.editRow}>
        <input className={styles.iconInput} value={icon} maxLength={4} placeholder="🧮" aria-label="Icon" onChange={(e) => setIcon(e.target.value)} />
        <input className={styles.textInput} value={name} placeholder={L.namePlaceholder} aria-label={L.name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>

      <h4 className={styles.group}>{L.inputs}</h4>
      {inputs.map((f, n) => <div key={n}>{fieldRow(f, (p) => setInput(n, p), inputs.length > 1 ? () => setInputs((l) => l.filter((_, k) => k !== n)) : undefined)}</div>)}
      <button type="button" className={styles.newBtn} onClick={() => setInputs((l) => [...l, blankField(nextKey())])}>{L.addInput}</button>

      <h4 className={styles.group}>{L.output}</h4>
      {fieldRow(output, (p) => setOutput((o) => ({ ...o, ...p })))}
      {keyProblem && <p className={styles.problem} role="alert">{keyProblem}</p>}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{L.formula}</span>
        <span className={styles.fieldRow}>
          <code className={styles.formulaKey}>{output.key || '?'} =</code>
          <input className={`${styles.textInput} ${styles.formulaInput}`} value={formula} spellCheck={false} placeholder={`${inputs[0]?.key || 'x'} * 12/44`} onChange={(e) => setFormula(e.target.value)} />
        </span>
        <span className={formulaProblem ? styles.problem : styles.hint}>{formulaProblem ?? L.formulaHint(inputKeys.join(', '))}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{L.inverse}</span>
        <span className={styles.fieldRow}>
          <code className={styles.formulaKey}>{inputs[0]?.key || '?'} =</code>
          <input className={`${styles.textInput} ${styles.formulaInput}`} value={inverse} spellCheck={false} disabled={!oneInput} placeholder={`${output.key || 'y'} * 44/12`} onChange={(e) => setInverse(e.target.value)} />
        </span>
        <span className={inverseProblem ? styles.problem : styles.hint}>{inverseProblem ?? (oneInput ? L.inverseHint(output.key) : L.inverseOneInput)}</span>
      </label>

      {valid && Number.isFinite(sample) && (
        <p className={styles.hint}>{L.try}: {draft.inputs.map((i) => `1 ${i.unit || i.key}`).join(', ')} → <strong>{showAmount(sample)} {output.unit}</strong></p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => onDone(null)}>{L.cancel}</button>
        <button type="button" className={styles.primary} onClick={save} disabled={!valid}>{L.save}</button>
      </div>
    </div>
  );
}

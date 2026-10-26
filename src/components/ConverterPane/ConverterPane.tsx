import { useMemo, useState } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { useUIStore } from '@/store/uiStore';
import { useConverterStore } from '@/store/converterStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { showToast } from '@/components/Toast/showToast';
import { CloseIcon, ConverterIcon, EditIcon, TrashIcon } from '@/components/Icons';
import { UNIT_CATEGORIES, unitCategory, type UnitCategory } from '@/config/units';
import { convertUnit, readAmount, runConverter, runConverterBack, showAmount, worksBothWays } from '@/utils/convert';
import { log } from '@/utils/log';
import { LABELS } from '@/config/labels';
import type { ConverterId, CustomConverter } from '@/types/converters';
import { ConverterEditor } from './ConverterEditor';
import styles from './ConverterPane.module.css';

const L = LABELS.converters;

type Item = { kind: 'units'; id: string; name: string; category: UnitCategory } | { kind: 'custom'; id: string; name: string; converter: CustomConverter };

const copy = (text: string) => navigator.clipboard.writeText(text).then(
  () => showToast({ message: L.copy(text) }),
  (e) => log.warn('converters', 'copy failed', e),
);

// The converters panel (Alt+=, a Place): built-in unit converters and the person's own. Search on
// the left, the chosen converter on the right, worked out as you type. Your own are made and
// edited here (ConverterEditor) and listed in Settings → Converters, which opens this same editor.
// No single primary action, so no Ctrl+Enter (the editor has one: Save).
export function ConverterPane() {
  const close = useUIStore((s) => s.closeConverters);
  const target = useUIStore((s) => s.converterTarget);
  const converters = useConverterStore((s) => s.converters);
  const recent = useConverterStore((s) => s.recent);
  const markUsed = useConverterStore((s) => s.markUsed);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(() => target?.select ?? recent[0] ?? 'length');
  const [editing, setEditing] = useState<string | null>(target?.edit ?? null);

  useEscapeClose(close);

  const items = useMemo<Item[]>(() => [
    ...UNIT_CATEGORIES.map((c): Item => ({ kind: 'units', id: c.id, name: L.categories[c.id], category: c })),
    ...Object.values(converters).sort((a, b) => a.name.localeCompare(b.name)).map((c): Item => ({ kind: 'custom', id: c.id, name: c.name, converter: c })),
  ], [converters]);

  const q = query.trim().toLowerCase();
  const matches = (it: Item) => !q || it.name.toLowerCase().includes(q) || (it.kind === 'units'
    ? it.category.units.some((u) => u.name.toLowerCase().includes(q) || u.symbol.toLowerCase() === q)
    : [...it.converter.inputs, it.converter.output].some((f) => f.label.toLowerCase().includes(q) || f.unit.toLowerCase() === q));
  const shown = items.filter(matches);
  const recentShown = q ? [] : recent.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i).slice(0, 4);
  const current = items.find((i) => i.id === selected) ?? shown[0];

  function pick(id: string) { setSelected(id); setEditing(null); markUsed(id); }

  async function remove(c: CustomConverter) {
    if (!(await confirmDelete(L.noun, c.name, undefined, { empty: false }))) return;   // a saved converter always has a formula
    useConverterStore.getState().deleteConverter(c.id);
    if (selected === c.id) setSelected('length');
  }

  const row = (it: Item, keyPrefix = '') => (
    <li key={keyPrefix + it.id}>
      <button type="button" className={`${styles.item} ${current?.id === it.id && !editing ? styles.itemOn : ''}`} onClick={() => pick(it.id)}>
        <span className={styles.itemIcon} aria-hidden="true">{it.kind === 'custom' ? <ItemIcon icon={it.converter.icon} fallback="🧮" /> : '📏'}</span>
        {it.name}
      </button>
    </li>
  );

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.pane} role="dialog" aria-label={L.title}>
        <div className={styles.header}>
          <span className={styles.title}><ConverterIcon aria-hidden="true" /> {L.title}</span>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label={LABELS.dateCalc.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <nav className={styles.side}>
            <input
              className={styles.search} value={query} placeholder={L.search} aria-label={L.search} autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) pick(shown[0].id); }}
            />
            <div className={styles.lists}>
              {recentShown.length > 0 && <ul className={styles.list}>{recentShown.map((it) => row(it, 'r:'))}</ul>}
              <h4 className={styles.group}>{L.builtIn}</h4>
              <ul className={styles.list}>{shown.filter((i) => i.kind === 'units').map((it) => row(it))}</ul>
              <h4 className={styles.group}>{L.custom}</h4>
              <ul className={styles.list}>{shown.filter((i) => i.kind === 'custom').map((it) => row(it))}</ul>
              {Object.keys(converters).length === 0 && !q && <p className={styles.hint}>{L.noneYet}</p>}
              {shown.length === 0 && <p className={styles.hint}>{L.nothing}</p>}
              <button type="button" className={styles.newBtn} onClick={() => setEditing('new')}>{L.newOne}</button>
            </div>
          </nav>
          <section className={styles.main}>
            {editing ? (
              <ConverterEditor
                key={editing}
                converter={editing === 'new' ? null : converters[editing as ConverterId] ?? null}
                onDone={(id) => { setEditing(null); if (id) pick(id); }}
              />
            ) : current?.kind === 'units' ? (
              <UnitView key={current.id} category={current.category} />
            ) : current?.kind === 'custom' ? (
              <CustomView key={current.id} converter={current.converter} onEdit={() => setEditing(current.id)} onDelete={() => void remove(current.converter)} />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function UnitView({ category }: { category: UnitCategory }) {
  const units = category.units;
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState(category.pair[0]);
  const [to, setTo] = useState(category.pair[1]);
  const value = readAmount(amount);
  const fromUnit = unitCategory(category.id)!.units.find((u) => u.id === from)!;
  const toUnit = units.find((u) => u.id === to)!;
  const result = Number.isFinite(value) ? convertUnit(value, fromUnit, toUnit) : NaN;

  return (
    <div className={styles.view}>
      <h3 className={styles.viewTitle}>{L.categories[category.id]}</h3>
      <div className={styles.convertRow}>
        <input className={styles.amount} value={amount} inputMode="decimal" aria-label={L.amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <select className={styles.select} value={from} aria-label={L.from} onChange={(e) => setFrom(e.target.value)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.symbol} · {u.name}</option>)}
        </select>
        <button type="button" className={styles.swap} onClick={() => { setFrom(to); setTo(from); }} aria-label={L.swap} title={L.swap}><ConverterIcon /></button>
        <select className={styles.select} value={to} aria-label={L.to} onChange={(e) => setTo(e.target.value)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.symbol} · {u.name}</option>)}
        </select>
      </div>
      <button type="button" className={styles.result} onClick={() => Number.isFinite(result) && void copy(`${showAmount(result)} ${toUnit.symbol}`)} title={LABELS.dateCalc.copy}>
        {showAmount(result)} <span className={styles.unit}>{toUnit.symbol}</span>
      </button>
      <h4 className={styles.group}>{L.allUnits}</h4>
      <ul className={styles.all}>
        {units.filter((u) => u.id !== from).map((u) => {
          const v = Number.isFinite(value) ? convertUnit(value, fromUnit, u) : NaN;
          return (
            <li key={u.id}>
              <button type="button" className={styles.allRow} onClick={() => Number.isFinite(v) && void copy(`${showAmount(v)} ${u.symbol}`)}>
                <span>{showAmount(v)}</span><span className={styles.unit}>{u.symbol} · {u.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CustomView({ converter: c, onEdit, onDelete }: { converter: CustomConverter; onEdit: () => void; onDelete: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(c.inputs.map((i) => [i.key, c.inputs.length === 1 ? '1' : ''])));
  const [backText, setBackText] = useState<string | null>(null);
  const nums = Object.fromEntries(c.inputs.map((i) => [i.key, readAmount(values[i.key] ?? '')]));
  const result = runConverter(c, nums);
  const both = worksBothWays(c);

  // Typing in the output works the one input out from it (a converter with a formula back).
  function typeOutput(text: string) {
    setBackText(text);
    const back = runConverterBack(c, readAmount(text));
    if (Number.isFinite(back)) setValues({ [c.inputs[0].key]: showAmount(back).replace(/,/g, '') });
  }

  return (
    <div className={styles.view}>
      <div className={styles.viewHead}>
        <h3 className={styles.viewTitle}>{c.icon && <span aria-hidden="true"><ItemIcon icon={c.icon} /> </span>}{c.name}</h3>
        <button type="button" className={styles.iconBtn} onClick={onEdit} aria-label={L.edit} title={L.edit}><EditIcon /></button>
        <button type="button" className={styles.iconBtn} onClick={onDelete} aria-label={L.delete} title={L.delete}><TrashIcon width="1em" height="1em" /></button>
      </div>
      {c.inputs.map((i, n) => (
        <label key={i.key} className={styles.field}>
          <span className={styles.fieldLabel}>{i.label || i.key}</span>
          <span className={styles.fieldRow}>
            <input className={styles.amount} value={values[i.key] ?? ''} inputMode="decimal" autoFocus={n === 0}
              onChange={(e) => { setBackText(null); setValues((v) => ({ ...v, [i.key]: e.target.value })); }} />
            <span className={styles.unit}>{i.unit}</span>
          </span>
        </label>
      ))}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{c.output.label || c.output.key}</span>
        {both ? (
          <span className={styles.fieldRow}>
            <input className={`${styles.amount} ${styles.outputInput}`} inputMode="decimal" aria-label={c.output.label || c.output.key}
              value={backText ?? (Number.isFinite(result) ? showAmount(result).replace(/,/g, '') : '')} onChange={(e) => typeOutput(e.target.value)} />
            <span className={styles.unit}>{c.output.unit}</span>
          </span>
        ) : (
          <button type="button" className={styles.result} onClick={() => Number.isFinite(result) && void copy(`${showAmount(result)} ${c.output.unit}`.trim())}>
            {showAmount(result)} <span className={styles.unit}>{c.output.unit}</span>
          </button>
        )}
      </div>
      <p className={styles.formula}><code>{c.output.key} = {c.formula}</code></p>
    </div>
  );
}

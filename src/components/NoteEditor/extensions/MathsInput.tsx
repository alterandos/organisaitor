import { useEffect, useRef } from 'react';
import type { MathfieldElement } from 'mathlive';
import { loadMathLive, MATH_SHORTCUTS } from './Maths';
import { log, errorMessage } from '@/utils/log';

// A formula in a Glossary card's field (a Formula's formula and symbols, a Definition's or
// Concept's Formula, 2026-11-03): MathLive, loaded the first time one shows, as in the `\maths`
// block. Held as LaTeX; saved shortly after typing stops and on leaving the field.
export function MathsInput({ value, onCommit, editable, label, placeholder, className }: {
  value: string; onCommit: (latex: string) => void; editable: boolean; label: string; placeholder?: string; className?: string;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  const saved = useRef(value);

  useEffect(() => {
    let gone = false;
    let el: MathfieldElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      if (el && el.value !== saved.current) { saved.current = el.value; commit.current(el.value); }
    };
    // Until MathLive has loaded, the LaTeX as text. The holder has no React children: React would
    // write the value's text into it on a change and wipe the field (found 2026-11-03: the formula
    // lost focus after a keystroke and the next keys fired the app's hotkeys).
    if (holder.current && !field.current) holder.current.textContent = saved.current;
    loadMathLive().then((m) => {
      if (gone || !holder.current) return;
      el = new m.MathfieldElement();
      // Attached first: MathLive refuses some properties (menuItems) on a field not in the page.
      holder.current.replaceChildren(el);
      el.setAttribute('aria-label', label);
      el.menuItems = [];
      el.inlineShortcuts = { ...el.inlineShortcuts, ...MATH_SHORTCUTS };
      if (placeholder) el.placeholder = `\\text{${placeholder}}`;
      el.readOnly = !editable;
      el.value = saved.current;
      el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 400); });
      el.addEventListener('focusout', save);
      // Plain keys typed into the maths are the maths', not the app's hotkeys or the card's.
      el.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
      });
      field.current = el;
    }).catch((e) => log.warn('maths', 'could not load the maths editor', errorMessage(e)));
    return () => { gone = true; save(); field.current = null; };
  }, [editable, label, placeholder]);

  // A change from elsewhere (another card of the same record) shows, unless it's being typed in here.
  useEffect(() => {
    const el = field.current;
    if (!el) { saved.current = value; if (holder.current) holder.current.textContent = value; return; }
    if (el.value === value || el.hasFocus()) return;
    saved.current = value;
    el.setValue(value, { silenceNotifications: true });
  }, [value]);

  return <span ref={holder} className={className} data-card-maths="" />;
}

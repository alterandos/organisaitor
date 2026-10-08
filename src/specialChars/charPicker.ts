import { LABELS } from '@/config/labels';
import type { CharMatch } from './charSets';
import styles from './CharPicker.module.css';

// The little list of characters under the cursor while `//name` is being typed: one for the whole
// app (only one field types at a time), plain DOM so a text field and the note editor share it.
// It never takes focus — the field keeps typing, and the field's own keys (fieldInput.ts, the
// editor extension) move the highlight and choose.

let el: HTMLDivElement | null = null;
let choose: ((i: number) => void) | null = null;

export interface CaretBox { left: number; top: number; bottom: number }

export function showCharPicker(at: CaretBox, matches: CharMatch[], selected: number, onChoose: (i: number) => void): void {
  choose = onChoose;
  if (!el) {
    el = document.createElement('div');
    el.className = styles.picker;
    el.setAttribute('role', 'listbox');
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();   // the field keeps focus and its selection
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-char-index]');
      if (item) choose?.(Number(item.dataset.charIndex));
    });
    document.body.append(el);
  }
  el.replaceChildren();
  if (matches.length === 0) {
    const none = document.createElement('div');
    none.className = styles.none;
    none.textContent = LABELS.specialChars.none;
    el.append(none);
  }
  matches.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = `${styles.item} ${i === selected ? styles.selected : ''}`;
    item.dataset.charIndex = String(i);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === selected));
    const glyph = document.createElement('span');
    glyph.className = styles.glyph;
    glyph.textContent = m.char;
    const name = document.createElement('span');
    name.className = styles.name;
    name.textContent = m.label;
    item.append(glyph, name);
    el!.append(item);
  });
  const hint = document.createElement('div');
  hint.className = styles.hint;
  hint.textContent = LABELS.specialChars.hint;
  el.append(hint);
  // Below the cursor, or above it when there's no room.
  el.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - el.offsetWidth - 8))}px`;
  const below = at.bottom + 6 + el.offsetHeight < window.innerHeight;
  el.style.top = `${below ? at.bottom + 6 : Math.max(8, at.top - el.offsetHeight - 6)}px`;
  el.querySelector(`.${styles.selected}`)?.scrollIntoView({ block: 'nearest' });
}

export function hideCharPicker(): void {
  el?.remove();
  el = null;
  choose = null;
}

export const charPickerOpen = () => el !== null;

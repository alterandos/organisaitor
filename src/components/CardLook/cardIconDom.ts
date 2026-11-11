import { createGlyph } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import './CardLook.module.css';

// The same icon as CardIcon.tsx, for a card drawn by ProseMirror (a decoration widget): see there.
// Returns null when there's nothing to draw (hidden, and it can't be brought back here).
export function createCardIcon({ icon, shown, onToggle, title }: {
  icon: string | Node;
  shown: boolean;
  onToggle?: (show: boolean) => void;
  title?: string;
}): HTMLElement | null {
  const L = LABELS.cardLook;
  const glyph = () => {
    const s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.append(typeof icon === 'string' ? icon : icon.cloneNode(true));
    return s;
  };
  const button = (attr: string, label: string, show: boolean, ...content: Node[]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute(attr, '');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(...content);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.stopPropagation(); onToggle?.(show); });
    return b;
  };
  if (!shown) return onToggle ? button('data-card-icon-show', L.showIcon, true, glyph()) : null;
  const el = document.createElement('span');
  el.setAttribute('data-card-part', 'icon');
  if (title) el.title = title;
  el.append(glyph());
  if (onToggle) el.append(button('data-card-icon-hide', L.hideIcon, false, createGlyph('close')));
  return el;
}

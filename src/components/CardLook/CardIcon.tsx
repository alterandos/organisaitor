import type { ReactNode } from 'react';
import { CloseIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import './CardLook.module.css';

// A card's kind icon in its Card design, with the buttons that hide it and bring it back (the
// user, 2026-11-10). THE one for React cards (the Glossary cards, the conversion); a card drawn by
// ProseMirror (the question) uses createCardIcon (cardIconDom.ts), which draws the same thing (a test
// keeps the two alike). The look is CardLook.module.css.
//   shown:    the icon, a hide button on its corner while hovered (if onToggle);
//   hidden:   with onToggle, a faint copy in the card's top left corner that brings it back.
export function CardIcon({ icon, shown, onToggle, title }: {
  icon: ReactNode;
  shown: boolean;
  onToggle?: (show: boolean) => void;
  title?: string;
}) {
  const L = LABELS.cardLook;
  if (!shown) {
    if (!onToggle) return null;
    return (
      <button type="button" data-card-icon-show="" title={L.showIcon} aria-label={L.showIcon}
        onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onToggle(true); }}>
        <span aria-hidden="true">{icon}</span>
      </button>
    );
  }
  return (
    <span data-card-part="icon" title={title}>
      <span aria-hidden="true">{icon}</span>
      {onToggle && (
        <button type="button" data-card-icon-hide="" title={L.hideIcon} aria-label={L.hideIcon}
          onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onToggle(false); }}>
          <CloseIcon />
        </button>
      )}
    </span>
  );
}

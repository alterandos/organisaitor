import { createPortal } from 'react-dom';
import { glossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { LABELS } from '@/config/labels';
import type { Offer } from './CardTermLinks';
import styles from './GlossaryCard.module.css';

// The floating pieces of term links in card fields (CardTermLinks.tsx): the offer chip, and a
// linked term's card on hover.

export function OfferChip({ offer }: { offer: Offer }) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(offer.anchor, { gap: 4 });
  return createPortal(
    <div ref={ref} className={styles.termOffer} style={style} role="status">
      {LABELS.glossary.autolinkOffer} <strong>{offer.term.icon} {offer.term.term}</strong>
    </div>,
    document.body,
  );
}

// A term's card, on hovering its link in a field: what it means, and where it's defined.
export function TermCard({ entryId, anchor, onEnter, onLeave }: { entryId: string; anchor: AnchorBox; onEnter: () => void; onLeave: () => void }) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 6 });
  const entry = glossaryEntry(entryId);
  const L = LABELS.glossary;
  return createPortal(
    <div ref={ref} className={styles.termCard} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {!entry ? <span>{L.missingDetail}</span> : (
        <>
          <strong>{entry.icon} {entry.term || L.untitled}</strong>
          <em>{entry.kindLabel}</em>
          <span>{entry.locked ? L.locked : entry.meaning || L.noMeaning}</span>
          <button type="button" onClick={() => { onLeave(); openNotePassage(entry.noteId, definitionPassage(entry.id)); }}>{L.goToDefinition}</button>
        </>
      )}
    </div>,
    document.body,
  );
}

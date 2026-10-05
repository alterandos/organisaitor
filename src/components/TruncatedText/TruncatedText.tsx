import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlatform } from '@/hooks/usePlatform';
import styles from './TruncatedText.module.css';

interface Props {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  // 'tooltip' (default): the full text in a small box below the row.
  // 'extend': the full text drawn in place over the truncated one, running out to the right past
  // the row's edge — reads as the row itself widening. Used for note titles (NoteList).
  reveal?: 'tooltip' | 'extend';
}

interface Extended {
  left: number; top: number; height: number; maxWidth: number;
  font: string; color: string; letterSpacing: string; background: string;
  // The row's own background continued past its right edge, full row height, behind the text.
  rowTail: { left: number; top: number; width: number; height: number } | null;
}

// The nearest ancestor background that isn't transparent — what the extended text must sit on so
// it looks like part of the row (the hover/active tint included) — and the element that paints it.
function rowBackground(el: HTMLElement): { color: string; node: HTMLElement | null } {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    // The pointer has only just arrived, so a row's hover tint may still be fading in (NoteList's
    // rows transition their background): finish that transition now and read the end colour.
    const transition = node.style.transition;
    node.style.transition = 'none';
    const bg = getComputedStyle(node).backgroundColor;
    node.style.transition = transition;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return { color: bg, node };
  }
  return { color: 'var(--color-surface)', node: null };
}

// A row taller than this many text lines isn't a row (it's the column or the page behind it).
const MAX_ROW_LINES = 4;
// Overlaps the row's rounded right corners so the tail joins it without a notch.
const TAIL_OVERLAP_PX = 4;

// Wraps a name/title that may be CSS-ellipsis-truncated (the wrapping span must already have
// overflow:hidden/text-overflow:ellipsis/white-space:nowrap — this component doesn't add that
// styling itself, only the hover behaviour) and, only when it's actually truncated, reveals the
// full text on hover. Either way the revealed text ignores the pointer (pointer-events: none) and
// shows only while the pointer is over the text itself, so moving towards a row's own hover
// buttons (NoteList's ↳/✎/✕ sit right of the title) hides it before the pointer gets there.
// Android has no hover (a tap's emulated mouseenter would pop the reveal up), so there the text
// wraps to two lines instead (docs/android/11 §6.1).
export function TruncatedText({ text, className, style, reveal = 'tooltip' }: Props) {
  const { isAndroid } = usePlatform();
  const ref = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);
  const [extended, setExtended] = useState<Extended | null>(null);

  const MAX_WIDTH = 320;

  const handleEnter = () => {
    const el = ref.current;
    if (isAndroid || !el || el.scrollWidth <= el.clientWidth) return; // not actually truncated — nothing to reveal
    const rect = el.getBoundingClientRect();
    if (reveal === 'extend') {
      const cs = getComputedStyle(el);
      const maxWidth = window.innerWidth - rect.left - 8;
      const bg = rowBackground(el);
      const rowRect = bg.node && bg.node !== el ? bg.node.getBoundingClientRect() : null;
      // scrollWidth is the full text's width; the 8px matches .extended's right padding.
      const textRight = rect.left + Math.min(el.scrollWidth + 8, maxWidth);
      const rowTail = rowRect && rowRect.height <= rect.height * MAX_ROW_LINES && textRight > rowRect.right
        ? { left: rowRect.right - TAIL_OVERLAP_PX, top: rowRect.top, width: textRight - rowRect.right + TAIL_OVERLAP_PX, height: rowRect.height }
        : null;
      setExtended({
        left: rect.left, top: rect.top, height: rect.height, maxWidth,
        font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing,
        background: bg.color, rowTail,
      });
      return;
    }
    const left = Math.min(rect.left, window.innerWidth - MAX_WIDTH - 8);
    setTooltip({ left: Math.max(4, left), top: rect.bottom + 4 });
  };

  const handleLeave = () => { setTooltip(null); setExtended(null); };

  return (
    <>
      <span ref={ref} className={`${className ?? ''} ${styles.text}`} style={style} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {text}
      </span>
      {tooltip && createPortal(
        <div className={styles.tooltip} style={{ left: tooltip.left, top: tooltip.top }}>
          {text}
        </div>,
        document.body
      )}
      {extended?.rowTail && createPortal(
        <div
          className={styles.rowTail}
          style={{ ...extended.rowTail, background: extended.background }}
        />,
        document.body
      )}
      {extended && createPortal(
        <div
          className={`${styles.extended} ${extended.rowTail ? styles.extendedOnTail : ''}`}
          style={{
            left: extended.left, top: extended.top, height: extended.height, lineHeight: `${extended.height}px`,
            maxWidth: extended.maxWidth, font: extended.font, color: extended.color,
            letterSpacing: extended.letterSpacing, background: extended.background,
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

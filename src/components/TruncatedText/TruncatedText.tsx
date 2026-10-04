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
}

// The nearest ancestor background that isn't transparent — what the extended text must sit on so
// it looks like part of the row (the hover/active tint included).
function rowBackground(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return 'var(--color-surface)';
}

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
      setExtended({
        left: rect.left, top: rect.top, height: rect.height,
        maxWidth: window.innerWidth - rect.left - 8,
        font: cs.font, color: cs.color, letterSpacing: cs.letterSpacing,
        background: rowBackground(el),
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
      {extended && createPortal(
        <div
          className={styles.extended}
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

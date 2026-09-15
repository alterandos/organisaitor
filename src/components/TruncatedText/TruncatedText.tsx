import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './TruncatedText.module.css';

interface Props {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

// Wraps a name/title that may be CSS-ellipsis-truncated (the wrapping span must already have
// overflow:hidden/text-overflow:ellipsis/white-space:nowrap — this component doesn't add that
// styling itself, only the hover behaviour) and, only when it's actually truncated, shows the
// full text in a small floating tooltip below the row on hover. Positioned below rather than at
// the cursor or over the row itself specifically so it never covers the row's own hover-reveal
// action buttons (Chronicle's ↳/✎/✕, NoteList's equivalents) — those sit inline in the same row,
// so anything overlapping the row risks hiding them right as the user reaches for one.
export function TruncatedText({ text, className, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);

  const MAX_WIDTH = 320;

  const handleEnter = () => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return; // not actually truncated — no tooltip needed
    const rect = el.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - MAX_WIDTH - 8);
    setTooltip({ left: Math.max(4, left), top: rect.bottom + 4 });
  };

  return (
    <>
      <span ref={ref} className={className} style={style} onMouseEnter={handleEnter} onMouseLeave={() => setTooltip(null)}>
        {text}
      </span>
      {tooltip && createPortal(
        <div className={styles.tooltip} style={{ left: tooltip.left, top: tooltip.top }}>
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

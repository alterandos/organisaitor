import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import styles from './NoteEditor.module.css';

// A dropdown from the note's ribbon (text colour, table, columns, Note ▾), portaled to the body and
// placed by utils/floatingPlacement.ts. Side by side, the ribbon scrolls sideways, and a dropdown
// drawn inside it was clipped to the ribbon's height (found 2026-11-02 with the Note menu). Every
// dropdown the ribbon opens is one of these; `anchor` is its button's box when it was opened.
export function RibbonDropdown({ anchor, align = 'center', className, children }: {
  anchor: AnchorBox | null; align?: 'start' | 'center' | 'end'; className: string; children: ReactNode;
}) {
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { gap: 5, align });
  return createPortal(
    <div ref={ref} className={`${styles.ribbonDropdown} ${className}`} style={style} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

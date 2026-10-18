import type { SVGProps } from 'react';
import type { NoteLayout } from '@/store/uiStore';

// A small drawing of a notes layout: one note, two side by side, three, four. The View ▾ menu
// and "Open beside" (two) use it. 1em square unless sized by the site.
const LAYOUT_PATHS: Record<NoteLayout, string> = {
  single: 'M2.5 3h11v10h-11z',
  two:    'M2.5 3h11v10h-11zM8 3v10',
  three:  'M2.5 3h11v10h-11zM8 3v10M2.5 8H8',
  four:   'M2.5 3h11v10h-11zM8 3v10M2.5 8h11',
};

export function NoteLayoutIcon({ layout, ...props }: SVGProps<SVGSVGElement> & { layout: NoteLayout }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" focusable="false" {...props}>
      <path d={LAYOUT_PATHS[layout]} />
    </svg>
  );
}

// A table: a header row and four cells (the note ribbon's Table, a chart's Edit data).
export function TableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <rect x="0" y="0" width="15" height="3" rx="0.5" />
      <rect x="0" y="4" width="7" height="3.5" rx="0.5" opacity="0.6" />
      <rect x="8" y="4" width="7" height="3.5" rx="0.5" opacity="0.6" />
      <rect x="0" y="9" width="7" height="3.5" rx="0.5" opacity="0.4" />
      <rect x="8" y="9" width="7" height="3.5" rx="0.5" opacity="0.4" />
    </svg>
  );
}

import type { SVGProps } from 'react';
import styles from './Icons.module.css';
import { CHEVRON_PATH } from './disclosurePath';

// THE expand/collapse arrow (a disclosure triangle's modern form, a chevron): points right while
// closed and turns to point down when open, the platform convention. Sized 1em so it follows the
// font size where it sits. Not for a dropdown trigger (▾ opens a list) or a submenu's ▸.
export function DisclosureIcon({ open, className, ...rest }: { open: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={[styles.disclosure, open ? styles.disclosureOpen : '', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      <path d={CHEVRON_PATH} />
    </svg>
  );
}

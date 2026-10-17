import type { SVGProps } from 'react';
import { Icon } from './ActionIcons';

// The Notes views (config/noteViews.ts) that aren't Places: the view switcher shows them, along
// with the Map's own icon. Same line style as ActionIcons.

// A tree of lines (Lucide's list-tree): the notebook tree.
export function TreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M21 12h-8" />
      <path d="M21 6H8" />
      <path d="M21 18h-8" />
      <path d="M3 6v4c0 1.1.9 2 2 2h3" />
      <path d="M3 10v6c0 1.1.9 2 2 2h3" />
    </Icon>
  );
}

// Tiles of different sizes (a bento grid): the Mosaic.
export function MosaicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="11" width="6" height="10" rx="1.5" />
      <rect x="3" y="15" width="10" height="6" rx="1.5" />
    </Icon>
  );
}

// A label (Lucide's tag): passages gathered by their tags.
export function TagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </Icon>
  );
}

import type { SVGProps } from 'react';
import { Icon } from './ActionIcons';
import { REVIEW_ICON_PATHS } from './reviewIcon';

// The Places (config/places.ts): Quick Access's row, and wherever else each place is reached
// from (the header, the nav rail, a view's own heading). Same line style as ActionIcons.

// An open book (Lucide's book-open).
export function GlossaryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </Icon>
  );
}

// Flashcards: a card with a tick in front of another (reviewIcon.ts, shared with plain-DOM code).
export function ReviewIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}>{REVIEW_ICON_PATHS.map((d) => <path key={d} d={d} />)}</Icon>;
}

// A clock with a turning-back arrow (Lucide's history).
export function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}

// A gear (Lucide's settings).
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

// Data in, into a tray (the nav rail's Data & Integrations button, where it was drawn first).
export function IntegrationsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon viewBox="0 0 22 22" strokeWidth="1.6" {...props}>
      <path d="M11 3v6M8 6l3 3 3-3" />
      <path d="M4 13h4v4a1 1 0 001 1h6a1 1 0 001-1v-4h2" />
    </Icon>
  );
}

// Books on a shelf (Lucide's library): Manage Library.
export function LibraryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </Icon>
  );
}

// An idea hub: a centre joined to three ideas around it. The note editor draws the same shape as
// plain SVG markup for a passage's marker (NoteEditor extensions/Hub.ts HUB_MARK_SVG).
export function HubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="12" cy="20" r="2" />
      <path d="M6.5 6.5 9.8 9.8M17.5 6.5l-3.3 3.3M12 15v3" />
    </Icon>
  );
}

// The Notes Map: notes as points joined by their links.
export function MapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="7" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="19" cy="10" r="2" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="17" cy="19" r="2" />
      <path d="M6.8 6.1 10.2 4.9M13.8 5l3.6 3.6M6.5 8.8 7.6 16M10 18.3l5 .5M18.4 12l-.9 5" />
    </Icon>
  );
}

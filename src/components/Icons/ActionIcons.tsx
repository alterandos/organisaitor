import type { SVGProps } from 'react';
import { GLYPHS, type GlyphName } from './glyphPaths';

// Outline icons on a 24px grid, 2px round-capped strokes, currentColor so they follow the
// button's text colour (and dark mode) — the Lucide set's conventions, which is also what most
// products use for these three actions: a trash can for delete, a lidded box for archive, and
// the same box with an up-arrow for restore. Always rendered next to a text label (never alone
// on a destructive action) and hidden from screen readers, so the label is what's announced.
export function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12.5 3 3 5-6" />
    </Icon>
  );
}

// Drawn from glyphPaths.ts, which plain-DOM code (glyphDom.ts) draws from too.
function Glyph({ glyph, ...props }: Omit<SVGProps<SVGSVGElement>, 'name'> & { glyph: GlyphName }) {
  return (
    <Icon {...props}>
      {GLYPHS[glyph].map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </Icon>
  );
}

// Delete. 16px by default; where it stands in for text (a row's or a field's delete), pass
// width/height "1em".
export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return <Glyph glyph="trash" {...props} />;
}

// The small controls that used to be typed as characters (✎ × ✕ 🔗): 1em square, so they take the
// size of the text around them (CLAUDE.md "Icons beside text are sized from that text").
const EM = { width: '1em', height: '1em' };
export function EditIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="edit" {...EM} {...props} />; }
export function CloseIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="close" {...EM} {...props} />; }
export function LinkIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="link" {...EM} {...props} />; }
export function UnlinkIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="unlink" {...EM} {...props} />; }
export function OpenIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="open" {...EM} {...props} />; }
// Swap one thing for another (put a different note in a pane).
export function SwapIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="swap" {...EM} {...props} />; }
export function IndentIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="indent" {...EM} {...props} />; }
export function OutdentIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="outdent" {...EM} {...props} />; }
export function ResetIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="reset" {...EM} {...props} />; }
export function PaletteIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="palette" {...EM} {...props} />; }
export function DesignIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="design" {...EM} {...props} />; }
export function StatusIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="status" {...EM} {...props} />; }
export function PlusIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="plus" {...EM} {...props} />; }
export function EndeavourIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="endeavour" {...EM} {...props} />; }
export function PurposeIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="purpose" {...EM} {...props} />; }
export function ReminderIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="reminder" {...EM} {...props} />; }
export function RoutineIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="routine" {...EM} {...props} />; }
export function TrackerIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="tracker" {...EM} {...props} />; }
export function UploadIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="upload" {...EM} {...props} />; }
export function ListIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="list" {...EM} {...props} />; }
export function NotebookIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="notebook" {...EM} {...props} />; }
export function StickyIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="sticky" {...EM} {...props} />; }
export function ScratchpadIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="scratchpad" {...EM} {...props} />; }
export function DateCalcIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="dateCalc" {...EM} {...props} />; }
export function BlockGuideIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="blockGuide" {...EM} {...props} />; }
export function ConverterIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="converter" {...EM} {...props} />; }
export function PresetIcon(props: SVGProps<SVGSVGElement>) { return <Glyph glyph="preset" {...EM} {...props} />; }

export function ArchiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </Icon>
  );
}

export function RestoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h2" />
      <path d="M20 8v11a2 2 0 0 1-2 2h-2" />
      <path d="m9 15 3-3 3 3" />
      <path d="M12 12v9" />
    </Icon>
  );
}

// A head and shoulders in a circle (Lucide's circle-user): the account button.
export function AccountIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </Icon>
  );
}

// A framed landscape (Lucide's image): choosing a picture.
export function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Icon>
  );
}

// A pushpin (Lucide's pin): keeping something in place.
export function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Icon>
  );
}

// The same pin struck through (Lucide's pin-off): taking a pin out of Quick Access.
export function UnpinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </Icon>
  );
}

// A lightning bolt (Lucide's zap): Quick Access, the header button and the overlay's tab.
export function QuickAccessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Icon>
  );
}

// A magnifying glass: Go to, the overlay's search tab.
export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

// A filled triangle pointing up or down: step a value by one (the ▲▼ of a segmented date or time
// field). Filled, as spin buttons conventionally are, so it reads at a small size.
export function StepIcon({ direction, ...props }: SVGProps<SVGSVGElement> & { direction: 'up' | 'down' }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d={direction === 'up' ? 'M5 2.2 9 7.8H1z' : 'M5 7.8 1 2.2h8z'} />
    </svg>
  );
}

// Text alignment: left, centre, right, justified (the note ribbon's four buttons).
const ALIGN_GLYPH = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight', justify: 'alignJustify' } as const;
export function AlignIcon({ align, ...props }: SVGProps<SVGSVGElement> & { align: keyof typeof ALIGN_GLYPH }) {
  return <Glyph glyph={ALIGN_GLYPH[align]} {...EM} {...props} />;
}

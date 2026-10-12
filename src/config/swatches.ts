import { LABELS } from './labels';

// THE colours a person can pick, everywhere in the suite: an Endeavour's, a tag's, a calendar
// item's, a notebook's, a note's accent, text in a note, a note block's frame. One list, so a
// colour means the same thing wherever it's chosen, and a new picker uses this, never its own list.
//
// Two forms of each colour, by the same name:
// - `hex` (and `pale`) is what's saved when a colour is stored as data (tags, Endeavours, text in a
//   note: stored as hex, synced and shown as-is in both themes), so it's a mid-tone that reads on
//   light and dark. `pale` is the soft variant for a fill behind text (ColorPicker's "light").
// - --color-swatch-<id> (index.css) is for something the app draws and stores by id (a block's
//   frame): tuned per theme for contrast. A pattern test checks every id has its token in both.

export interface Swatch {
  id:    SwatchId;
  label: string;
  hex:   string;
  pale:  string;
}

export const SWATCH_IDS = ['grey', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'] as const;
export type SwatchId = typeof SWATCH_IDS[number];

const VALUES: Record<SwatchId, { hex: string; pale: string }> = {
  grey:   { hex: '#64748b', pale: '#cbd5e1' },
  red:    { hex: '#ef4444', pale: '#fca5a5' },
  orange: { hex: '#f97316', pale: '#fdba74' },
  yellow: { hex: '#eab308', pale: '#fde047' },
  lime:   { hex: '#84cc16', pale: '#bef264' },
  green:  { hex: '#22c55e', pale: '#86efac' },
  teal:   { hex: '#14b8a6', pale: '#99f6e4' },
  cyan:   { hex: '#06b6d4', pale: '#67e8f9' },
  blue:   { hex: '#3b82f6', pale: '#93c5fd' },
  indigo: { hex: '#6366f1', pale: '#a5b4fc' },
  purple: { hex: '#8b5cf6', pale: '#c4b5fd' },
  pink:   { hex: '#ec4899', pale: '#f9a8d4' },
};

export const SWATCHES: Swatch[] = SWATCH_IDS.map((id) => ({ id, label: LABELS.swatches[id], ...VALUES[id] }));

export const SWATCH_HEXES = SWATCHES.map((s) => s.hex);
export const SWATCH_PALES = SWATCHES.map((s) => s.pale);

// A stored hex's name, for an accessible label ("Blue"), or the hex itself if it isn't one of ours.
export const swatchLabel = (hex: string): string =>
  SWATCHES.find((s) => s.hex === hex.toLowerCase() || s.pale === hex.toLowerCase())?.label ?? hex;

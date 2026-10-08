import { LABELS } from '@/config/labels';

// What can fill the room below the end of a note (settingsStore.noteBackdrop, NoteBackdrop.tsx).
// A preset is drawn by its CSS in NoteBackdrop.module.css under [data-backdrop="<id>"], the same
// rule for the area and its swatch; a new preset is an id here, its label and that CSS.

export const NOTE_BACKDROP_PRESETS = ['aurora', 'lattice', 'ripples', 'dusk', 'blueprint', 'ocean', 'paper', 'sunset'] as const;
export type NoteBackdropPreset = typeof NOTE_BACKDROP_PRESETS[number];

export type NoteBackdrop =
  | null                                          // the plain grey (--color-overscroll)
  | { kind: 'preset'; id: NoteBackdropPreset }
  | { kind: 'image'; src: string };               // a compressed data URL

export const noteBackdropLabel = (id: NoteBackdropPreset) => LABELS.noteBackdrop.presets[id];

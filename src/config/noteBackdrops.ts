import { LABELS } from '@/config/labels';
import type { PictureId } from '@/types/pictures';

// What can fill the room below the end of a note (settingsStore.noteBackdrop, NoteBackdrop.tsx).
// A preset is drawn by its CSS in NoteBackdrop.module.css under [data-backdrop="<id>"], the same
// rule for the area and its swatch; a new preset is an id here, its label and that CSS.

export const NOTE_BACKDROP_PRESETS = ['aurora', 'lattice', 'ripples', 'dusk', 'blueprint', 'ocean', 'paper', 'sunset'] as const;
export type NoteBackdropPreset = typeof NOTE_BACKDROP_PRESETS[number];

// The app-wide backdrop (settingsStore.noteBackdrop): every note whose own and whose notebooks'
// say nothing (utils/noteBackdrop.ts). A note or notebook may choose its own (NoteBackdropChoice).
export type NoteBackdrop =
  | null                                          // the plain grey (--color-overscroll)
  | { kind: 'preset'; id: NoteBackdropPreset }
  | { kind: 'picture'; pictureId: PictureId }     // in the picture library (services/pictures.ts)
  | { kind: 'image'; src: string };               // before the library (2026-10-17): moved into it on start (moveLegacyBackdrop)

export const noteBackdropLabel = (id: NoteBackdropPreset) => LABELS.noteBackdrop.presets[id];

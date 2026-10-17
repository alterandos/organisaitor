import type { ComponentType, SVGProps } from 'react';
import { LABELS } from '@/config/labels';
import { GlossaryIcon, HubIcon, MapIcon, MosaicIcon, ReviewIcon, TagIcon, TreeIcon } from '@/components/Icons';
import type { PlaceId } from '@/config/places';

// THE list of what the Notes section can show (CLAUDE.md "Notes views", agreed 2026-10-17):
//   - a *view* is a way of browsing the notes (Tree today; Mosaic, Desk, Lenses, River to come);
//     the view switcher offers these;
//   - a *tool* is a destination of its own (Glossary, Review, Hubs, the tagged passages), reached
//     from Quick Access, the Places and the Notes menu, not from the switcher.
// One field, uiStore.notesView, says which is showing. This file is data only (no components), so
// uiStore can read it; what each one renders is components/NotesSection/noteViewComponents.ts.
// A new view is one entry here, its component there, and its label in LABELS.

export type NotesViewId = 'tree' | 'mosaic' | 'map' | 'glossary' | 'review' | 'hubs' | 'tagView';

export interface NoteViewDef {
  id:          NotesViewId;
  kind:        'view' | 'tool';
  label:       string;
  Icon:        ComponentType<SVGProps<SVGSVGElement>>;
  // Opening it counts as a visit to this Place (Quick Access's order).
  place?:      PlaceId;
  // Whether the note editor is part of it. Opening a note at a passage from one that doesn't
  // (services/notePassage.ts) goes to the Tree, so the note is seen.
  showsEditor: boolean;
  // Desktop only (a view that needs a pointer and room); Android shows the Tree instead.
  desktopOnly?: boolean;
  // Each level gone into, and the level a note was opened from, is a back/forward stop (the
  // Mosaic's zoom). The Tree keeps its own rule (a stop per note).
  historyStops?: boolean;
}

export const NOTE_VIEWS: Record<NotesViewId, NoteViewDef> = {
  tree:     { id: 'tree',     kind: 'view', label: LABELS.notesViews.tree,    Icon: TreeIcon,     showsEditor: true },
  mosaic:   { id: 'mosaic',   kind: 'view', label: LABELS.notesViews.mosaic,  Icon: MosaicIcon,   showsEditor: true, desktopOnly: true, historyStops: true },
  map:      { id: 'map',      kind: 'view', label: LABELS.noteMap.title,      Icon: MapIcon,      showsEditor: true, place: 'map', historyStops: true },
  glossary: { id: 'glossary', kind: 'tool', label: LABELS.glossary.open,      Icon: GlossaryIcon, showsEditor: false, place: 'glossary' },
  review:   { id: 'review',   kind: 'tool', label: LABELS.review.title,       Icon: ReviewIcon,   showsEditor: false, place: 'review' },
  hubs:     { id: 'hubs',     kind: 'tool', label: LABELS.hubs.title,         Icon: HubIcon,      showsEditor: false, place: 'hubs' },
  tagView:  { id: 'tagView',  kind: 'tool', label: LABELS.notesViews.tagView, Icon: TagIcon,      showsEditor: true },
};

// The views, in the switcher's order.
export const NOTE_VIEW_ORDER: NotesViewId[] = (Object.keys(NOTE_VIEWS) as NotesViewId[]).filter((id) => NOTE_VIEWS[id].kind === 'view');

export const DEFAULT_NOTES_VIEW: NotesViewId = 'tree';

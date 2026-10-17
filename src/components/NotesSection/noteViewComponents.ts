import { lazy, type ComponentType } from 'react';
import type { NotesViewId } from '@/config/noteViews';
import { ChronicleView } from '../ChronicleView/ChronicleView';
import { MobileNotes } from '../MobileNotes/MobileNotes';
import { TagView } from './TagView';
import { GlossaryView } from './GlossaryView';
import { ReviewView } from './ReviewView';
import { HubsView } from './HubsView';
import { MosaicView } from '../NoteViews/Mosaic/MosaicView';

// What each Notes view and tool (config/noteViews.ts) renders. `Phone` replaces it on Android;
// `lazy` ones load the first time they're shown (NotesSection wraps them in Suspense).

// The Map carries React Flow and d3-hierarchy: its own chunk, loaded the first time it's opened.
const MapView = lazy(() => import('../NoteViews/Map/MapView'));

export interface NoteViewComponents {
  Component: ComponentType;
  Phone?:    ComponentType;
  lazy?:     boolean;
}

export const NOTE_VIEW_COMPONENTS: Record<NotesViewId, NoteViewComponents> = {
  tree:     { Component: ChronicleView, Phone: MobileNotes },
  mosaic:   { Component: MosaicView },
  map:      { Component: MapView, lazy: true },
  glossary: { Component: GlossaryView },
  review:   { Component: ReviewView },
  hubs:     { Component: HubsView },
  tagView:  { Component: TagView },
};

import type { ComponentType, SVGProps } from 'react';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { dueReviews } from '@/services/noteReview';
import { AccountIcon, GlossaryIcon, HistoryIcon, HubIcon, IntegrationsIcon, LibraryIcon, MapIcon, ReviewIcon, SettingsIcon, TrashIcon } from '@/components/Icons';

// Places: destinations that aren't items — a section's tools (Glossary, Review) and the suite's
// own panes (Settings, Account, …). Quick Access shows them as its Places row, ordered by use
// (each place's open action in uiStore records the visit as `place:<id>`), and finds them by
// name. A new tool or pane worth jumping to is one entry here, plus `recordVisit('place', id)` in
// its open action. Sections aren't places: they have the 0–7 hotkeys and the nav rail.

export type PlaceId = 'glossary' | 'review' | 'hubs' | 'map' | 'history' | 'manage' | 'settings' | 'account' | 'integrations' | 'recycling-bin';

export interface Place {
  id:    PlaceId;
  label: string;
  // From components/Icons, the same icon every other way to this place shows (CLAUDE.md "Icons
  // come from one place"); never an emoji typed here.
  Icon:  ComponentType<SVGProps<SVGSVGElement>>;
  open:  () => void;
  badge?: () => number;   // a count worth seeing before going there (reviews due); 0 shows nothing
}

export const PLACES: Place[] = [
  { id: 'glossary',      label: LABELS.glossary.open,       Icon: GlossaryIcon,     open: () => { const ui = useUIStore.getState(); ui.setActiveView('notes'); ui.setNotesView('glossary'); } },
  { id: 'review',        label: LABELS.review.title,        Icon: ReviewIcon,       open: () => { const ui = useUIStore.getState(); ui.setActiveView('notes'); ui.setNotesView('review'); }, badge: () => dueReviews().length },
  { id: 'hubs',          label: LABELS.hubs.title,          Icon: HubIcon,          open: () => { const ui = useUIStore.getState(); ui.setActiveView('notes'); ui.setNotesView('hubs'); } },
  { id: 'map',           label: LABELS.noteMap.title,       Icon: MapIcon,          open: () => { const ui = useUIStore.getState(); ui.setActiveView('notes'); ui.setNotesView('map'); } },
  { id: 'history',       label: LABELS.history.moreLabel,   Icon: HistoryIcon,      open: () => useUIStore.getState().openHistoryBrowser() },
  { id: 'manage',        label: LABELS.places.manage,       Icon: LibraryIcon,      open: () => useUIStore.getState().openManage() },
  { id: 'settings',      label: LABELS.places.settings,     Icon: SettingsIcon,     open: () => useUIStore.getState().openSettings() },
  { id: 'account',       label: LABELS.places.account,      Icon: AccountIcon,      open: () => useUIStore.getState().openAccount() },
  { id: 'integrations',  label: LABELS.places.integrations, Icon: IntegrationsIcon, open: () => useUIStore.getState().openIntegrations() },
  { id: 'recycling-bin', label: LABELS.recyclingBin.title,  Icon: TrashIcon,        open: () => useUIStore.getState().openRecyclingBin() },
];

export const placeById = (id: string): Place | undefined => PLACES.find((p) => p.id === id);

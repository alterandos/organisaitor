import type { AppView } from '@/store/uiStore';
import { LABELS } from '@/config/labels';

// THE list of sections (adopted 2026-10-29, CLAUDE.md "Sections come from one registry"): everything
// the app shell needs to know about a section, in nav order, so adding, moving or merging one is a
// change here, not in the header, the nav rail, the tab bar and every filter check. A section's icon
// is in components/NavSidebar/navItems.tsx (SECTION_ICONS, keyed by section, every one required);
// what N makes there is services/newItem.ts; its "where was I" for history is capturePlace /
// goToPlace in uiStore.ts.
export interface SectionDef {
  view:  AppView;
  label: string;                         // the nav rail's name, history, Go to
  title: string;                         // the header's heading while in it
  group: 'top' | 'core' | 'extras';      // the rail's three groups, divided by lines
  tab:   boolean;                        // in the phone's tab bar (the rest are in the More sheet)
  endeavourFilter: boolean;              // the header's Endeavour filter (and E) works here
  tagFilter: boolean;                    // the header's tag filter works here (2026-11-06)
  tier:  'core' | 'addon';               // config/apps.ts: an add-on can be turned off per user
}

export const SECTIONS: readonly SectionDef[] = [
  { view: 'endeavours', label: LABELS.views.endeavours, title: LABELS.views.endeavours, group: 'top',    tab: true,  endeavourFilter: false, tagFilter: false, tier: 'core' },
  { view: 'overview',   label: LABELS.views.overview,   title: LABELS.views.overview,   group: 'top',    tab: false, endeavourFilter: false, tagFilter: false, tier: 'core' },
  { view: 'tasks',      label: LABELS.views.tasks,      title: 'My To Do',              group: 'core',   tab: true,  endeavourFilter: true,  tagFilter: true,  tier: 'core' },
  { view: 'calendar',   label: LABELS.views.calendar,   title: LABELS.views.calendar,   group: 'core',   tab: true,  endeavourFilter: true,  tagFilter: true,  tier: 'core' },
  { view: 'records',    label: LABELS.views.records,    title: LABELS.views.records,    group: 'core',   tab: true,  endeavourFilter: true,  tagFilter: true,  tier: 'core' },
  { view: 'lists',      label: LABELS.views.lists,      title: LABELS.views.lists,      group: 'core',   tab: true,  endeavourFilter: false, tagFilter: true,  tier: 'core' },
  { view: 'notes',      label: LABELS.views.notes,      title: LABELS.views.notes,      group: 'core',   tab: false, endeavourFilter: true,  tagFilter: true,  tier: 'core' },
  { view: 'portfolio',  label: LABELS.views.portfolio,  title: LABELS.views.portfolio,  group: 'extras', tab: false, endeavourFilter: false, tagFilter: false, tier: 'addon' },
  { view: 'fitness',    label: LABELS.views.fitness,    title: LABELS.views.fitness,    group: 'extras', tab: false, endeavourFilter: false, tagFilter: false, tier: 'addon' },
];

export const SECTION_BY_VIEW = Object.fromEntries(SECTIONS.map((s) => [s.view, s])) as Record<AppView, SectionDef>;

export const showsEndeavourFilter = (view: AppView): boolean => SECTION_BY_VIEW[view].endeavourFilter;
export const showsTagFilter = (view: AppView): boolean => SECTION_BY_VIEW[view].tagFilter;

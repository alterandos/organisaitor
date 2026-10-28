import { EndeavourIcon } from '@/components/Icons';
import type { AppView } from '@/store/uiStore';
import { LABELS } from '@/config/labels';

// Each section's icon (SECTION_ICONS, below: every section must have one), for the nav rail, the
// phone's tab bar and any other place that shows a section (the history browser). Everything else
// about a section is config/sections.ts. A file of its own so the components that use them stay
// component-only (fast refresh).

const CORE_NAV_ITEMS: { view: AppView; label: string; icon: React.ReactNode }[] = [
  {
    view: 'tasks',
    label: LABELS.views.tasks,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M5 7h12M5 11h12M5 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="3" cy="7"  r="1" fill="currentColor"/>
        <circle cx="3" cy="11" r="1" fill="currentColor"/>
        <circle cx="3" cy="15" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    view: 'calendar',
    label: LABELS.views.calendar,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M3 9h16" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8 3v4M14 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="8"  cy="13" r="1" fill="currentColor"/>
        <circle cx="11" cy="13" r="1" fill="currentColor"/>
        <circle cx="14" cy="13" r="1" fill="currentColor"/>
        <circle cx="8"  cy="16" r="1" fill="currentColor"/>
        <circle cx="11" cy="16" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    view: 'records',
    label: LABELS.views.records,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <rect x="13" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <rect x="3" y="13" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <rect x="13" y="13" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
  },
  {
    view: 'lists',
    label: 'Lists',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="16" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <rect x="3" y="9.5" width="16" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <rect x="3" y="15" width="10" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
  },
  {
    view: 'notes',
    label: 'Notes',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M7 7h8M7 11h8M7 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
];

// Overview sits above every app (it gathers from all of them), with a divider under it — the
// user's call, 2026-10-01. Not in CORE_NAV_ITEMS, which MobileNav's tab bar also reads.
export const OverviewIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M11 3v8l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11 11H3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

export const PortfolioIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <rect x="3"  y="12" width="4" height="7"  rx="1" stroke="currentColor" strokeWidth="1.6"/>
    <rect x="9"  y="7"  width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.6"/>
    <rect x="15" y="3"  width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.6"/>
  </svg>
);

export const FitnessIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M3 15l4-4 3 3 5-7 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="18" cy="6" r="2" stroke="currentColor" strokeWidth="1.6"/>
  </svg>
);

// The Endeavours section (2026-10-28): at the top of the rail, above Overview; in the phone's tab bar.
// The same drawing as the Endeavour icon everywhere else (components/Icons).
export const EndeavoursIcon = <EndeavourIcon width="22" height="22" />;

const coreIcon = (view: AppView) => CORE_NAV_ITEMS.find((i) => i.view === view)!.icon;

// Every section's icon. A Record over AppView, so a new section can't be left without one.
export const SECTION_ICONS: Record<AppView, React.ReactNode> = {
  endeavours: EndeavoursIcon,
  overview:   OverviewIcon,
  tasks:      coreIcon('tasks'),
  calendar:   coreIcon('calendar'),
  records:    coreIcon('records'),
  lists:      coreIcon('lists'),
  notes:      coreIcon('notes'),
  portfolio:  PortfolioIcon,
  fitness:    FitnessIcon,
};

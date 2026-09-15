import type { AppView } from '@/store/uiStore';

// Suite-readiness registry: which nav sections are bundled with the core Organizer
// (always present, always eagerly loaded) vs. optional "add-on" apps (Portfolio,
// Fitness — below the <hr> divider in NavSidebar) that the future suite model treats
// as separately installable, and possibly paid.
export type AppTier = 'core' | 'addon';

export const APP_TIERS: Record<AppView, AppTier> = {
  tasks:     'core',
  calendar:  'core',
  records:   'core',
  lists:     'core',
  notes:     'core',
  portfolio: 'addon',
  fitness:   'addon',
};

// Single choke point for "is this app available to the current user." Today there is
// no purchase/entitlement backend, so every addon is enabled for everyone — but every
// place that needs to know (NavSidebar's icon list, App.tsx's route + hotkey gating)
// calls through this one function, so wiring a real entitlement check later (e.g.
// reading a Supabase `user_entitlements` table) is a one-function change, not a search
// through the app for every place an app's availability is assumed.
export function isAppEnabled(_view: AppView): boolean {
  return true;
}

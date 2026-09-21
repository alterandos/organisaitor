import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HOTKEYS } from '@/config/hotkeys';
import { matchesBinding } from '@/utils/hotkeyBinding';
import { persistStorage } from '@/utils/persistStorage';

// A slot is `undefined` (no override — use the hotkeys.ts default) or a binding string, or
// `null` (the user explicitly cleared this slot, e.g. removed the secondary binding
// entirely without assigning a replacement).
export type OverrideSlot = string | null | undefined;
export interface HotkeyOverride { primary?: OverrideSlot; secondary?: OverrideSlot }

interface HotkeyOverridesState {
  overrides: Record<string, HotkeyOverride>; // keyed by HotkeyDef.id

  setOverride:   (id: string, slot: 'primary' | 'secondary', binding: string | null) => void;
  resetHotkey:   (id: string) => void;
  resetAll:      () => void;
}

export const useHotkeyOverridesStore = create<HotkeyOverridesState>()(
  persist(
    (set) => ({
      overrides: {},

      setOverride: (id, slot, binding) => set((s) => ({
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], [slot]: binding } },
      })),

      resetHotkey: (id) => set((s) => {
        const { [id]: _, ...rest } = s.overrides;
        return { overrides: rest };
      }),

      resetAll: () => set({ overrides: {} }),
    }),
    { name: 'todo-hotkey-overrides', storage: persistStorage(), version: 1, migrate: (persisted) => persisted as HotkeyOverridesState }
  )
);

// Effective binding for one hotkey id: an explicit override (including an explicit `null`
// clear) always wins over the hotkeys.ts default; `undefined` (never touched) falls back
// to the default. Plain function, not a hook, for use from App.tsx's keydown handler
// (which needs the current value on every keystroke, not a subscription).
export function getEffectiveBinding(id: string): { primary: string | null; secondary: string | null } {
  const def = HOTKEYS.find((h) => h.id === id);
  const override = useHotkeyOverridesStore.getState().overrides[id];
  const primary = override && 'primary' in override ? override.primary ?? null : def?.primary ?? null;
  const secondary = override && 'secondary' in override ? override.secondary ?? null : def?.secondary ?? null;
  return { primary, secondary };
}

// Convenience for App.tsx's central keydown dispatcher: does this event match either
// slot of hotkey `id`'s current effective binding (override, or default if untouched)?
export function matchesHotkeyId(e: KeyboardEvent, id: string): boolean {
  const { primary, secondary } = getEffectiveBinding(id);
  return matchesBinding(e, primary) || matchesBinding(e, secondary);
}

// Every id + slot currently bound to `binding`, excluding `excludeId` (the hotkey being
// rebound itself — pressing the same key it's already assigned to isn't a conflict).
// Used by the Settings rebind UI to detect a collision before committing a new binding.
export function findConflicts(binding: string, excludeId: string): { id: string; action: string }[] {
  const results: { id: string; action: string }[] = [];
  for (const def of HOTKEYS) {
    if (def.id === excludeId || !def.customizable) continue;
    const eff = getEffectiveBinding(def.id);
    if (eff.primary === binding || eff.secondary === binding) {
      results.push({ id: def.id, action: def.action });
    }
  }
  return results;
}

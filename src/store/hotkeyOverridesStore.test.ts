import { beforeEach, describe, expect, it } from 'vitest';
import { useHotkeyOverridesStore, getEffectiveBinding, matchesHotkeyId, findConflicts } from '@/store/hotkeyOverridesStore';

beforeEach(() => {
  useHotkeyOverridesStore.setState(useHotkeyOverridesStore.getInitialState(), true);
});

function key(k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods } as KeyboardEvent;
}

describe('getEffectiveBinding', () => {
  it('falls back to the hotkeys.ts default when untouched', () => {
    expect(getEffectiveBinding('nav-tasks')).toEqual({ primary: '1', secondary: 'Ctrl+1' });
  });

  it('an explicit override wins over the default', () => {
    useHotkeyOverridesStore.getState().setOverride('nav-tasks', 'primary', 'F1');
    expect(getEffectiveBinding('nav-tasks').primary).toBe('F1');
    // Untouched slot still falls back.
    expect(getEffectiveBinding('nav-tasks').secondary).toBe('Ctrl+1');
  });

  it('an explicit null clear reads as "no binding", not "fall back to default"', () => {
    useHotkeyOverridesStore.getState().setOverride('nav-tasks', 'secondary', null);
    expect(getEffectiveBinding('nav-tasks').secondary).toBeNull();
    expect(getEffectiveBinding('nav-tasks').primary).toBe('1');
  });

  it('resetHotkey removes the whole override, restoring both slots to default', () => {
    useHotkeyOverridesStore.getState().setOverride('nav-tasks', 'primary', 'F1');
    useHotkeyOverridesStore.getState().resetHotkey('nav-tasks');
    expect(getEffectiveBinding('nav-tasks')).toEqual({ primary: '1', secondary: 'Ctrl+1' });
  });

  it('resetAll clears every override', () => {
    useHotkeyOverridesStore.getState().setOverride('nav-tasks', 'primary', 'F1');
    useHotkeyOverridesStore.getState().setOverride('nav-calendar', 'primary', 'F2');
    useHotkeyOverridesStore.getState().resetAll();
    expect(getEffectiveBinding('nav-tasks').primary).toBe('1');
    expect(getEffectiveBinding('nav-calendar').primary).toBe('2');
  });
});

describe('matchesHotkeyId', () => {
  it('matches the default primary or secondary binding', () => {
    expect(matchesHotkeyId(key('1'), 'nav-tasks')).toBe(true);
    expect(matchesHotkeyId(key('1', { ctrlKey: true }), 'nav-tasks')).toBe(true);
    expect(matchesHotkeyId(key('2'), 'nav-tasks')).toBe(false);
  });

  it('matches the override once one is set, not the old default', () => {
    useHotkeyOverridesStore.getState().setOverride('nav-tasks', 'primary', 'F1');
    expect(matchesHotkeyId(key('F1'), 'nav-tasks')).toBe(true);
    expect(matchesHotkeyId(key('1'), 'nav-tasks')).toBe(false);
  });
});

describe('findConflicts', () => {
  it('finds another customizable hotkey already bound to the same key', () => {
    const conflicts = findConflicts('2', 'nav-tasks');
    expect(conflicts.map((c) => c.id)).toContain('nav-calendar');
  });

  it('excludes the hotkey being rebound itself (its own current binding is not a conflict)', () => {
    const conflicts = findConflicts('1', 'nav-tasks');
    expect(conflicts.map((c) => c.id)).not.toContain('nav-tasks');
  });

  it('checks the effective (overridden) binding, not just the hotkeys.ts default', () => {
    useHotkeyOverridesStore.getState().setOverride('action-settings', 'primary', 'F5');
    expect(findConflicts('F5', 'nav-tasks').map((c) => c.id)).toContain('action-settings');
    // The old default 'S' is no longer bound to action-settings, so it's no longer a conflict for it.
    expect(findConflicts('S', 'nav-tasks').map((c) => c.id)).not.toContain('action-settings');
  });

  it('never flags a non-customizable hotkey (e.g. the protected Escape) as a conflict', () => {
    expect(findConflicts('Esc', 'nav-tasks').map((c) => c.id)).not.toContain('action-escape');
  });

  it('a binding nothing uses has no conflicts', () => {
    expect(findConflicts('Ctrl+Alt+Shift+F12', 'nav-tasks')).toEqual([]);
  });
});

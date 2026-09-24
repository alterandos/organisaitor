import { describe, expect, it } from 'vitest';
import { captureBindingFromEvent, formatBinding, matchesBinding, parseBinding } from '@/utils/hotkeyBinding';
import { HOTKEYS } from '@/config/hotkeys';

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: '', ...overrides } as KeyboardEvent;
}

describe('parseBinding / formatBinding round-trip', () => {
  it('round-trips every default customizable binding in config/hotkeys.ts', () => {
    for (const def of HOTKEYS) {
      if (!def.customizable) continue;
      for (const binding of [def.primary, def.secondary].filter((b): b is string => !!b)) {
        // Skip the one non-binding placeholder entry ("0-9" documents a range, not a real binding).
        if (binding === '0-9') continue;
        expect(formatBinding(parseBinding(binding))).toBe(binding);
      }
    }
  });

  it('parses a plain letter as uppercase with no modifiers', () => {
    expect(parseBinding('N')).toEqual({ key: 'N', ctrl: false, shift: false, alt: false, meta: false });
  });

  it('parses Ctrl+letter', () => {
    expect(parseBinding('Ctrl+1')).toEqual({ key: '1', ctrl: true, shift: false, alt: false, meta: false });
  });

  it('parses named special keys', () => {
    expect(parseBinding('Space').key).toBe(' ');
    expect(parseBinding('Backspace').key).toBe('Backspace');
    expect(parseBinding('Esc').key).toBe('Escape');
  });

  it('parses multiple modifiers in any written order, formatting in the canonical order', () => {
    expect(formatBinding(parseBinding('Alt+Left'))).toBe('Alt+Left');
    expect(formatBinding(parseBinding('Shift+Ctrl+A'))).toBe('Ctrl+Shift+A');
  });
});

describe('matchesBinding', () => {
  it('requires an exact modifier match, not just the key', () => {
    const binding = 'Ctrl+1';
    expect(matchesBinding(makeKeyEvent({ key: '1', ctrlKey: true }), binding)).toBe(true);
    expect(matchesBinding(makeKeyEvent({ key: '1', ctrlKey: true, shiftKey: true }), binding)).toBe(false);
    expect(matchesBinding(makeKeyEvent({ key: '1', ctrlKey: false }), binding)).toBe(false);
  });

  it('a plain single-key binding does not match if any modifier is held', () => {
    expect(matchesBinding(makeKeyEvent({ key: 'n' }), 'N')).toBe(true);
    expect(matchesBinding(makeKeyEvent({ key: 'n', ctrlKey: true }), 'N')).toBe(false);
    expect(matchesBinding(makeKeyEvent({ key: 'n', altKey: true }), 'N')).toBe(false);
  });

  it('returns false for a null/undefined binding', () => {
    expect(matchesBinding(makeKeyEvent({ key: 'N' }), null)).toBe(false);
    expect(matchesBinding(makeKeyEvent({ key: 'N' }), undefined)).toBe(false);
  });

  it('matches a named key like Escape or Space', () => {
    expect(matchesBinding(makeKeyEvent({ key: 'Escape' }), 'Esc')).toBe(true);
    expect(matchesBinding(makeKeyEvent({ key: ' ' }), 'Space')).toBe(true);
  });
});

describe('captureBindingFromEvent', () => {
  it('returns null for a bare modifier press', () => {
    expect(captureBindingFromEvent(makeKeyEvent({ key: 'Control' }))).toBeNull();
    expect(captureBindingFromEvent(makeKeyEvent({ key: 'Shift' }))).toBeNull();
    expect(captureBindingFromEvent(makeKeyEvent({ key: 'Alt' }))).toBeNull();
    expect(captureBindingFromEvent(makeKeyEvent({ key: 'Meta' }))).toBeNull();
  });

  it('captures a real key with modifiers into the canonical string form', () => {
    expect(captureBindingFromEvent(makeKeyEvent({ key: 'g', ctrlKey: true }))).toBe('Ctrl+G');
  });

  it('round-trips through matchesBinding for the same event', () => {
    const e = makeKeyEvent({ key: 'k', ctrlKey: true, shiftKey: true });
    const captured = captureBindingFromEvent(e);
    expect(matchesBinding(e, captured)).toBe(true);
  });
});

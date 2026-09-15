// Parsing/matching/capture for the customizable-hotkeys feature (see src/config/hotkeys.ts
// and src/store/hotkeyOverridesStore.ts). A "binding string" is the same format hotkeys.ts
// already uses for its `primary`/`secondary` display strings on the customizable subset —
// e.g. '1', 'Ctrl+1', 'Space', 'Backspace' — so existing defaults parse with no data change.

const MODIFIER_ORDER = ['Ctrl', 'Shift', 'Alt', 'Meta'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

// Maps a binding-string key token <-> the KeyboardEvent.key value it represents. Only
// needs to cover keys actually used across the customizable set plus common rebind targets
// — extend if a future customizable hotkey needs another special key.
const KEY_TOKEN_TO_EVENT_KEY: Record<string, string> = {
  Space: ' ',
  Esc: 'Escape',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Enter: 'Enter',
  Tab: 'Tab',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
};
const EVENT_KEY_TO_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_TOKEN_TO_EVENT_KEY).map(([token, key]) => [key, token])
);

export interface ParsedBinding {
  key:  string;              // normalized KeyboardEvent.key value (uppercase for single letters)
  ctrl: boolean;
  shift: boolean;
  alt:  boolean;
  meta: boolean;
}

export function parseBinding(binding: string): ParsedBinding {
  const parts = binding.split('+').map((p) => p.trim()).filter(Boolean);
  const keyToken = parts[parts.length - 1] ?? '';
  const modifierTokens = parts.slice(0, -1).map((p) => p.toLowerCase());
  const rawKey = KEY_TOKEN_TO_EVENT_KEY[keyToken] ?? keyToken;
  return {
    key:   rawKey.length === 1 ? rawKey.toUpperCase() : rawKey,
    ctrl:  modifierTokens.includes('ctrl'),
    shift: modifierTokens.includes('shift'),
    alt:   modifierTokens.includes('alt'),
    meta:  modifierTokens.includes('meta'),
  };
}

const MODIFIER_FLAG: Record<Modifier, keyof Omit<ParsedBinding, 'key'>> = {
  Ctrl: 'ctrl', Shift: 'shift', Alt: 'alt', Meta: 'meta',
};

export function formatBinding(parsed: ParsedBinding): string {
  const mods = MODIFIER_ORDER.filter((m) => parsed[MODIFIER_FLAG[m]]);
  const keyToken = EVENT_KEY_TO_TOKEN[parsed.key] ?? parsed.key;
  return [...mods, keyToken].join('+');
}

export function matchesBinding(e: KeyboardEvent, binding: string | null | undefined): boolean {
  if (!binding) return false;
  const p = parseBinding(binding);
  const eventKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return (
    eventKey === p.key &&
    e.ctrlKey  === p.ctrl &&
    e.shiftKey === p.shift &&
    e.altKey   === p.alt &&
    e.metaKey  === p.meta
  );
}

// Used by the Settings rebind UI while "listening" for a key press. Returns null for a
// bare modifier press (Control/Shift/Alt/Meta alone aren't a complete binding — wait for a
// real key alongside them) so the capture UI can keep listening instead of committing a
// half-formed binding.
const BARE_MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function captureBindingFromEvent(e: KeyboardEvent): string | null {
  if (BARE_MODIFIER_KEYS.has(e.key)) return null;
  return formatBinding({
    key:   e.key.length === 1 ? e.key.toUpperCase() : e.key,
    ctrl:  e.ctrlKey,
    shift: e.shiftKey,
    alt:   e.altKey,
    meta:  e.metaKey,
  });
}

// Human-readable form for the rebind UI (kept identical to the binding string itself today
// — pulled out as its own function so display formatting can diverge from the storage
// format later without touching call sites).
export function displayBinding(binding: string): string {
  return binding;
}

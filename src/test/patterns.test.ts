// "Pattern governance" (CLAUDE.md) as executable checks — the codebase's own
// "Pattern retrofit backlog" (BACKLOG.md) turned into tests so drift is caught in CI
// instead of at the next manual audit. Each check prints the offending file:line.
//
// This file reads source under `src/` and a few config files directly with `node:fs`
// rather than importing the modules under test, since several checks are about what the
// SOURCE TEXT looks like (a raw `window.confirm(` call, a hard-coded z-index), not runtime
// behavior.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...walk(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function linesOf(file: string): string[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

// All .ts/.tsx source files, excluding test files themselves.
const SOURCE_FILES = walk(SRC, ['.ts', '.tsx']).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
const TSX_FILES = SOURCE_FILES.filter((f) => f.endsWith('.tsx'));

function isCommentLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function findMatches(files: string[], pattern: RegExp, opts: { skipComments?: boolean } = {}): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of files) {
    linesOf(file).forEach((text, i) => {
      if (opts.skipComments && isCommentLine(text)) return;
      if (pattern.test(text)) hits.push({ file: rel(file), line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

function describeHits(hits: { file: string; line: number; text: string }[]): string {
  return hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n');
}

// ── 1. No native popups ─────────────────────────────────────────────────────────────
describe('pattern: no native popups', () => {
  it('no window.confirm|alert|prompt anywhere in src', () => {
    const hits = findMatches(SOURCE_FILES, /\bwindow\.(confirm|alert|prompt)\(/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

// ── 2. Every persisted store has a name in PERSISTED_STORAGE_KEYS and a version ────
describe('pattern: every persist() call has a versioned, registered name', () => {
  const backupSrc = fs.readFileSync(path.join(SRC, 'config', 'backup.ts'), 'utf8');
  const registeredKeys = new Set([...backupSrc.matchAll(/'([a-z0-9-]+)',?\s*\/\//g)].map((m) => m[1]));
  // Explicit allow-list: persisted keys deliberately NOT part of the full-backup set.
  const ALLOWED_EXTRA = new Set(['todo-remembered-email', 'todo-sync-pending']);

  const storeFiles = walk(path.join(SRC, 'store'), ['.ts']).filter((f) => !f.endsWith('.test.ts'));

  it('every persist() name is registered in PERSISTED_STORAGE_KEYS or the explicit allow-list', () => {
    const bad: string[] = [];
    for (const file of storeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const m of content.matchAll(/persist\(\s*[\s\S]*?\{\s*name:\s*'([^']+)'/g)) {
        const name = m[1];
        if (!registeredKeys.has(name) && !ALLOWED_EXTRA.has(name)) bad.push(`${rel(file)}: persist name "${name}" not in PERSISTED_STORAGE_KEYS or the allow-list`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('every persist() call declares a version', () => {
    const bad: string[] = [];
    for (const file of storeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (!/persist\(/.test(content)) continue;
      // Look at the persist options object (from "persist(" through the matching top-level close)
      // approximated by checking a `version:` appears somewhere after the persist( call in the file —
      // precise enough given the codebase's convention of one persist() call per store file.
      if (!/\bversion:\s*\d+/.test(content)) bad.push(`${rel(file)}: persist() with no version:`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

// ── 3. Escape handling only through useEscapeClose (+ documented inline exceptions) ─
describe('pattern: Escape handling goes through useEscapeClose', () => {
  // The mechanism itself, plus files where the literal 'Escape' names a key TOKEN (a label,
  // a lookup table entry) rather than a keydown handler reacting to it.
  const ALLOWED_FILES = new Set([
    'src/hooks/useEscapeClose.ts',
    'src/utils/hotkeyBinding.ts',
    'src/store/hotkeyOverridesStore.ts', // KEY_TOKEN_TO_EVENT_KEY maps the 'Esc' token name, not a handler
    'src/config/hotkeys.ts',            // the 'Esc' hotkey definition/label, not a handler
    'src/store/uiStore.ts',             // closeTopmostMobileOverlay: Android hardware back button — its own
                                          // documented priority list (CLAUDE.md "not covered" note), not Escape-key text
  ]);
  // CLAUDE.md's one deliberate exception: a capture-phase listener that owns all keys for a
  // moment and consumes Escape itself before the stack ever sees it (SettingsPane's
  // hotkey-rebind capture).
  const CAPTURE_EXCEPTIONS = new Set(['src/components/SettingsPane/SettingsPane.tsx:110']);
  // A handler that deliberately does nothing to Escape (explicit early-return, letting it
  // bubble untouched to the Escape stack) rather than consuming it — not a stopPropagation
  // case at all, so it can't be found by scanning for that call.
  const PASS_THROUGH_EXCEPTIONS = new Set(['src/components/NoteEditor/NoteBacklinks.tsx:57']);

  it("every source hit of the literal 'Escape' either lives in the mechanism itself, or is an inline handler that calls stopPropagation (within a few lines), or a documented exception", () => {
    const bad: string[] = [];
    for (const file of SOURCE_FILES) {
      const relPath = rel(file);
      if (ALLOWED_FILES.has(relPath)) continue;
      const lines = linesOf(file);
      lines.forEach((text, i) => {
        if (!/'Escape'/.test(text)) return;
        const key = `${relPath}:${i + 1}`;
        if (CAPTURE_EXCEPTIONS.has(key) || PASS_THROUGH_EXCEPTIONS.has(key)) return;
        const window = lines.slice(i, i + 4).join(' ');
        if (!/stopPropagation/.test(window)) bad.push(`${key}  ${text.trim()}`);
      });
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

// ── 4 & 5. Overlay/modal conventions ────────────────────────────────────────────────
describe('pattern: overlay components call useEscapeClose', () => {
  // A component "renders an overlay" if its module references styles.overlay (the CSS-module
  // convention documented in CLAUDE.md's "Modals" section).
  const overlayComponents = TSX_FILES.filter((f) => /styles\.overlay\b/.test(fs.readFileSync(f, 'utf8')));

  it('every component rendering styles.overlay calls useEscapeClose (directly, or via useItemActions, which wraps it)', () => {
    const bad = overlayComponents
      .filter((f) => {
        const content = fs.readFileSync(f, 'utf8');
        return !/useEscapeClose\(/.test(content) && !/useItemActions\(/.test(content);
      })
      .map(rel);
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('pattern: creation modals bind Ctrl+Enter', () => {
  // Deliberate, documented exception (CLAUDE.md "Ctrl+Enter" section): no single primary action.
  const ALLOW_LIST = new Set(['NoteTagPresetModal']);

  const modalFiles = TSX_FILES.filter((f) => {
    const base = path.basename(f, '.tsx');
    return (/^Add.*Modal$/.test(base) || /^Edit.*Modal$/.test(base) || /^Edit.*Pane$/.test(base)) && !ALLOW_LIST.has(base);
  });

  it('every Add*Modal / Edit*Modal / Edit*Pane binds Ctrl+Enter', () => {
    const bad = modalFiles
      .filter((f) => {
        const content = fs.readFileSync(f, 'utf8');
        return !/useCtrlEnterSubmit\(/.test(content) && !/ctrlKey.*Enter|Enter.*ctrlKey|key === 'Enter'/.test(content);
      })
      .map(rel);
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

// ── 6. Endeavour only via labels.ts ─────────────────────────────────────────────────
describe('pattern: "Endeavour" terminology comes from labels.ts', () => {
  // Only flags the literal word inside a quoted/template string (a string a person or the
  // model reads) — not bare identifiers like `endeavourId`/`requireEndeavour`, which are
  // internal naming, not "terms" in CLAUDE.md's sense ("any string that names Endeavour...").
  const QUOTED_ENDEAVOUR = /(['"`])[^'"`]*\bEndeavour\b[^'"`]*\1/;

  // KNOWN NON-CONFORMING (see BACKLOG.md "Pattern retrofit backlog" — "Terms from labels.ts"):
  // src/agent/'s tool descriptions and error messages hard-code "Endeavour" throughout. This
  // was added by the AI command layer (Chunk A) after the 2026-09-20 Endeavour audit, so it
  // was never covered. Deliberately not fixed here — these are AI tool-schema/error strings
  // (not UI a person reads directly), and brief 03's own rules require discussing any change
  // to agent-facing wording with the user before making it. Remove this exemption once that
  // retrofit happens and the check should then find zero sites.
  const AGENT_DIR_EXEMPT = path.join(SRC, 'agent') + path.sep;

  it('no hard-coded "Endeavour" string literal outside labels.ts, comments, and the documented src/agent/ exemption', () => {
    const files = SOURCE_FILES.filter((f) => !f.endsWith(path.join('config', 'labels.ts')) && !f.startsWith(AGENT_DIR_EXEMPT));
    const bad = findMatches(files, QUOTED_ENDEAVOUR, { skipComments: true });
    expect(bad, describeHits(bad)).toEqual([]);
  });
});

// ── 7. TimeInput / apiFetch ─────────────────────────────────────────────────────────
describe('pattern: no raw type="time" outside TimeInput; no raw fetch(\'/api', () => {
  it('type="time" only appears in TimeInput.tsx', () => {
    const hits = findMatches(TSX_FILES.filter((f) => !f.endsWith(path.join('TimeInput', 'TimeInput.tsx'))), /type=["']time["']/);
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it("no raw fetch('/api — must go through apiFetch", () => {
    const files = SOURCE_FILES.filter((f) => !f.endsWith(path.join('utils', 'apiFetch.ts')));
    const hits = findMatches(files, /(?<!api)fetch\(\s*['"`]\/api/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

// ── 8. hotkeys.ts ids ───────────────────────────────────────────────────────────────
describe('pattern: hotkeys.ts ids', () => {
  const hotkeysSrc = fs.readFileSync(path.join(SRC, 'config', 'hotkeys.ts'), 'utf8');
  const idMatches = [...hotkeysSrc.matchAll(/\{\s*id:\s*'([^']+)'[^}]*\}/g)];
  const defs = idMatches.map((m) => ({ id: m[1], block: m[0] }));

  it('every id is unique', () => {
    const seen = new Map<string, number>();
    for (const d of defs) seen.set(d.id, (seen.get(d.id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes, dupes.join(', ')).toEqual([]);
  });

  it('every customizable: true id is dispatched via matchesHotkeyId in App.tsx (or a documented component-local handler)', () => {
    const appSrc = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    // matchesHotkeyPrimary (e.g. action-back/action-forward) is the primary-slot-only variant
    // used when a hotkey's primary binding must bypass the isTyping guard but its secondary
    // shouldn't — still a valid App.tsx-central dispatch for this check's purposes.
    const dispatchedInApp = new Set([
      ...appSrc.matchAll(/matchesHotkeyId\(e,\s*'([^']+)'\)/g),
      ...appSrc.matchAll(/matchesHotkeyPrimary\(e,\s*'([^']+)'\)/g),
    ].map((m) => m[1]));
    // Component-local hotkeys (CLAUDE.md "Hotkeys rule") are deliberately not wired to
    // matchesHotkeyId at all yet — this check only covers ids meant to be App.tsx-central.
    // action-dictate and the nav/action ids above are all App.tsx-central; component-local
    // hotkeys in hotkeys.ts (Calendar/Notes/Lists' own) are not marked customizable today.
    const customizableIds = defs.filter((d) => /customizable:\s*true/.test(d.block)).map((d) => d.id);
    const missing = customizableIds.filter((id) => !dispatchedInApp.has(id));
    expect(missing, missing.join(', ')).toEqual([]);
  });
});

// ── 9. SYNC_TABLES matches the runInitSync fetch list ───────────────────────────────
describe('pattern: SYNC_TABLES matches the runInitSync fetch order', () => {
  it('same tables, same order', () => {
    const syncSrc = fs.readFileSync(path.join(SRC, 'services', 'sync', 'syncService.ts'), 'utf8');
    const syncTablesMatch = syncSrc.match(/const SYNC_TABLES = \[([\s\S]*?)\] as const/);
    expect(syncTablesMatch).toBeTruthy();
    const syncTables = [...syncTablesMatch![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    const fetchSection = syncSrc.match(/const results = await Promise\.all\(\[([\s\S]*?)\]\);/);
    expect(fetchSection).toBeTruthy();
    const fetchTables = [...fetchSection![1].matchAll(/supabase\.from\('([a-z_]+)'\)\.select/g)].map((m) => m[1]);

    expect(fetchTables).toEqual(syncTables);
  });
});

// ── 10. Migrations: grants + listed in CLAUDE.md ────────────────────────────────────
describe('pattern: migration hygiene', () => {
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();
  // Tables created by these migrations are granted later, in bulk, by 022 — documented in
  // CLAUDE.md's migration 022 entry ("grant … for every table added by 008/012/018/019/020/021").
  const GRANTED_LATER_BY_022 = new Set([
    '008_notes_initial.sql',
    '012_fitness_strava.sql',
    '018_calendar_sync.sql',
    '019_user_vault.sql',
    '020_notes_sync.sql',
    '021_portfolio_sync.sql',
  ]);

  it('every migration that creates a table also grants (directly, or via the documented 022 exception)', () => {
    const bad: string[] = [];
    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const createsTable = /create table/i.test(content);
      const hasGrant = /\bgrant\s/i.test(content);
      if (createsTable && !hasGrant && !GRANTED_LATER_BY_022.has(file)) bad.push(file);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('every migration file is listed in CLAUDE.md\'s Migration history table', () => {
    const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const missing = migrationFiles.filter((f: string) => !claudeMd.includes(f));
    expect(missing, missing.join('\n')).toEqual([]);
  });
});

// ── 11. taskStore / noteStore must not import each other directly ──────────────────
describe('pattern: taskStore and noteStore never import each other directly', () => {
  it('only services/crossAppLinkCleanup.ts (and services/taskCalendarLinks.ts, which imports task+calendar, not notes) may bridge domain stores', () => {
    const taskStoreSrc = fs.readFileSync(path.join(SRC, 'store', 'taskStore.ts'), 'utf8');
    const noteStoreSrc = fs.readFileSync(path.join(SRC, 'store', 'noteStore.ts'), 'utf8');
    expect(/from ['"]@\/store\/noteStore['"]/.test(taskStoreSrc)).toBe(false);
    expect(/from ['"]@\/store\/taskStore['"]/.test(noteStoreSrc)).toBe(false);
  });
});

// ── 12. No constant inline styles ───────────────────────────────────────────────────
describe('pattern: no constant inline styles (dynamic values only)', () => {
  it('style={{ ... }} with a string/number literal value is only used where documented', () => {
    // Mirrors the backlog's grep. Documented exception: six NoteEditor.tsx portaled
    // elements carrying a constant position/transform alongside a measured top/left.
    const ALLOWED = new Set(['src/components/NoteEditor/NoteEditor.tsx']);
    const hits = findMatches(
      TSX_FILES.filter((f) => !ALLOWED.has(rel(f))),
      /style=\{\{\s*[a-zA-Z]+:\s*('[^']*'|[0-9.]+)/
    );
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

// ── 13. Every sync xToRow explicitly clears the tombstone on a live upsert ─────────
describe('pattern: every mapper xToRow sends an explicit deleted_at: null', () => {
  // Supabase's upsert() only touches columns present in the object — omitting deleted_at
  // would leave a row previously tombstoned by another device (or restored from the
  // Recycling Bin) zombie-tombstoned forever (see mappers.ts's taskToRow comment, and
  // CLAUDE.md "Recycling Bin"). A new xToRow mapper must include this from the start.
  it('every exported *ToRow function body contains deleted_at: null', () => {
    const mappersSrc = fs.readFileSync(path.join(SRC, 'services', 'sync', 'mappers.ts'), 'utf8');
    const fnMatches = [...mappersSrc.matchAll(/export function (\w+ToRow)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(fnMatches.length).toBeGreaterThan(0);
    const bad = fnMatches
      .filter(([, , body]) => !/deleted_at:\s*null/.test(body))
      .map(([, name]) => name);
    expect(bad, bad.join(', ')).toEqual([]);
  });
});

describe('pattern: zustand selectors return a stable reference', () => {
  it("no useXStore((s) => Object.values/keys/entries(...)) or an inline array/object literal — allocates a new snapshot every call, which causes an infinite render loop under useSyncExternalStore (found in StructuredTagPopover's collections selector, 2026-09-24). Select the raw record/array field instead and derive in the render body.", () => {
    const hits = findMatches(
      SOURCE_FILES,
      /use\w*Store\(\s*\(?\w*\)?\s*=>\s*(Object\.(values|keys|entries)\(|\[|\{)/,
      { skipComments: true }
    );
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

// ── 15. Row hover-action menu — no re-hand-rolled inline-growth pattern ─────────────
describe('pattern: nav-column row actions use RowHoverActions, not the old inline-growth CSS', () => {
  // The pattern's own two files, and ItemCard's .itemCardActions (a list-ITEM card in
  // ListsSection's main content area, not a nav-column row — deliberately out of scope, see
  // CLAUDE.md "Row hover-action menu").
  const ALLOWED = new Set([
    'src/components/RowHoverActions/useRowHoverActions.ts',
    'src/components/RowHoverActions/RowHoverActionsMenu.tsx',
    'src/components/ListsSection/ListsSection.module.css',
    'src/components/ListsSection/ListsSection.tsx',
  ]);
  it('no CSS class named *Actions gated by a bare :hover opacity/max-width reveal (the old per-component hand-rolled pattern this replaced)', () => {
    const cssFiles = SOURCE_FILES.filter((f) => f.endsWith('.module.css') && !ALLOWED.has(rel(f)));
    const hits = findMatches(cssFiles, /:hover\s+\.\w*Actions\s*\{/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

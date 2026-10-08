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
  ]);
  // CLAUDE.md's one deliberate exception: a capture-phase listener that owns all keys for a
  // moment and consumes Escape itself before the stack ever sees it (SettingsPane's
  // hotkey-rebind capture).
  const CAPTURE_EXCEPTIONS = new Set(['src/components/SettingsPane/SettingsPane.tsx:84']);
  // A handler that deliberately does nothing to Escape (explicit early-return, letting it
  // bubble untouched to the Escape stack) rather than consuming it — not a stopPropagation
  // case at all, so it can't be found by scanning for that call.
  const PASS_THROUGH_EXCEPTIONS = new Set(['src/components/NoteEditor/NoteBacklinks.tsx:58']);

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
describe('pattern: anything that closes on an outside click also closes on Escape', () => {
  // A dropdown/panel with an outside-click listener is an overlay too. The notifications panel
  // (NotificationCenter) and the speed dial had the listener but not the Escape registration (found 2026-10-05).
  it("every component with a document mousedown listener calls useEscapeClose", () => {
    const bad = TSX_FILES.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return src.includes("addEventListener('mousedown'") && !/useEscapeClose\(/.test(src);
    });
    expect(bad.map(rel)).toEqual([]);
  });
});

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

// ── 9. Sync load is keyed by table name, never by position ──────────────────────────
// A hand-written fetch list destructured into positional variables drifted out of step with
// hydrateStores on 2026-09-27 and merged every store from tracker_entries on with the next
// table's rows. The fetch is now generated from SYNC_TABLES and handed around as a name-keyed map.
describe('pattern: sync load is keyed by table name', () => {
  const syncSrc = fs.readFileSync(path.join(SRC, 'services', 'sync', 'syncService.ts'), 'utf8');
  const syncTables = [...syncSrc.match(/const SYNC_TABLES = \[([\s\S]*?)\] as const/)![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  it('runInitSync fetches SYNC_TABLES itself, not a separate hand-written list', () => {
    expect(syncSrc).toMatch(/Promise\.all\(SYNC_TABLES\.map\(/);
    expect(syncSrc).not.toMatch(/supabase\.from\('[a-z_]+'\)\.select/);
  });

  it('hydrateStores merges every table in SYNC_TABLES, by name', () => {
    const body = syncSrc.match(/function hydrateStores\(remote: RemoteRows\) \{([\s\S]*?)\n\}/)![1];
    const missing = syncTables.filter((t) => !body.includes(`remote.${t},`));
    expect(missing, missing.join(', ')).toEqual([]);
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

  // Rows open their actions from a "⋯" button (RowOptionsMenu), never on a hover of the whole
  // row (decided 2026-10-05). The hover machinery itself is only used by RowOptionsMenu and by
  // HoverOptions (a button offering alternatives to its click).
  it('only RowOptionsMenu and HoverOptions use useRowHoverActions / RowHoverActionsMenu', () => {
    const OWNERS = new Set([
      'src/components/RowHoverActions/RowOptionsMenu.tsx',
      'src/components/RowHoverActions/RowHoverActionsMenu.tsx',
      'src/components/RowHoverActions/useRowHoverActions.ts',
      'src/components/HoverOptions/HoverOptions.tsx',
    ]);
    const hits = findMatches(SOURCE_FILES.filter((f) => !OWNERS.has(rel(f))), /\b(useRowHoverActions|RowHoverActionsMenu)\b/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('no pane renders the same field twice', () => {
  // A merge once left CalendarEventPane with two Links fields (found 2026-10-05: every link showed twice).
  it('each component renders <LinksField> and <CrossAppRefPicker> at most once', () => {
    const bad = TSX_FILES.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return (src.match(/<LinksField\b/g) ?? []).length > 1 || (src.match(/<CrossAppRefPicker\b/g) ?? []).length > 1;
    });
    expect(bad.map(rel)).toEqual([]);
  });
});

describe('pattern: creation panes switch kinds through config/createKinds.ts', () => {
  // Every registered kind must have a pane that shows the switcher (naming its id), or choosing it
  // from a sibling's switcher would land in a pane with no way back.
  it('every CREATE_KINDS id is named by some <CreateKindSwitcher> pane', () => {
    const registry = fs.readFileSync(path.join(SRC, 'config', 'createKinds.ts'), 'utf8');
    const ids = [...registry.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    const panes = TSX_FILES.map((f) => fs.readFileSync(f, 'utf8')).filter((src) => src.includes('<CreateKindSwitcher'));
    const missing = ids.filter((id) => !panes.some((src) => src.includes(`'${id}'`) || src.includes(`"${id}"`)));
    expect(missing).toEqual([]);
  });
});

describe('pattern: right-click menus go through the context-menu registry', () => {
  // One listener (ContextMenuHost) decides every right-click from the scopes and providers in
  // src/contextMenu/. A component handling contextmenu itself would fight it. The exceptions only
  // ever suppress the event: the menu itself, BottomSheet and useLongPress (Android long-press).
  const ALLOWED = new Set([
    'src/components/ContextMenu/ContextMenuHost.tsx',
    'src/components/ContextMenu/ContextMenu.tsx',
    'src/components/BottomSheet/BottomSheet.tsx',
    'src/hooks/useLongPress.ts',
  ]);
  it('no other file listens for contextmenu', () => {
    const hits = findMatches(SOURCE_FILES.filter((f) => !ALLOWED.has(rel(f))), /onContextMenu\b|['"]contextmenu['"]/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('<ContextMenuHost /> is mounted exactly once, in App.tsx', () => {
    const hits = findMatches(TSX_FILES, /<ContextMenuHost\s*\/>/);
    expect(hits.map((h) => h.file)).toEqual(['src/App.tsx']);
  });
});

describe('pattern: the UI completes tasks through toggleTaskCompletion', () => {
  // services/taskCompletion.ts is where "waiting on other tasks?" is asked and the Completed toast
  // (+ Follow-up / Undo) is shown. A component calling the lower layers directly would silently
  // skip both. The lower layers stay callable from services (and agent/access.ts, by design).
  it('no component calls toggleTaskWithLists or the store toggleTask directly', () => {
    const componentFiles = SOURCE_FILES.filter((f) => rel(f).startsWith('src/components/'));
    const hits = findMatches(componentFiles, /toggleTaskWithLists\(|\.toggleTask\(|useTaskStore\(\(s\) => s\.toggleTask\)/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: /api/* calls go through apiFetch', () => {
  // A relative /api/ fetch only works in the browser PWA: the packaged apps (Tauri, Android) have
  // no backend at their own origin, and apiFetch is what routes them to the production deployment.
  it("no fetch('/api… outside utils/apiFetch.ts", () => {
    const files = SOURCE_FILES.filter((f) => rel(f) !== 'src/utils/apiFetch.ts');
    const hits = findMatches(files, /\bfetch\(\s*['"`]\/api\//, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: toasts go through showToast and the one ToastHost', () => {
  it('<ToastHost /> is mounted exactly once, in App.tsx (showToast shows nothing without it)', () => {
    const hits = findMatches(TSX_FILES, /<ToastHost\s*\/>/);
    expect(hits.map((h) => h.file)).toEqual(['src/App.tsx']);
  });
});

describe('pattern: "link a …" pickers suggest by keywords', () => {
  // Every picker orders its list the same way — keyword suggestions from the item being linked
  // from, then recent (utils/suggestRank.ts; NotePickerModal has the tab-aware original).
  const pickers = SOURCE_FILES.filter((f) => /PickerModal\.tsx$/.test(f));

  it('every *PickerModal takes suggestFrom and ranks through utils/suggestRank (NotePickerModal: its own tab-aware ranking)', () => {
    const bad = pickers.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      if (!src.includes('suggestFrom')) return true;
      return !rel(f).endsWith('NotePickerModal.tsx') && !src.includes("from '@/utils/suggestRank'");
    });
    expect(bad.map(rel)).toEqual([]);
  });

  it('every place that opens a *PickerModal passes suggestFrom', () => {
    const hits = findMatches(TSX_FILES, /<\w+PickerModal\b/).filter((h) => {
      const lines = linesOf(path.join(ROOT, h.file));
      return !lines.slice(h.line - 1, h.line + 6).join('\n').includes('suggestFrom');
    });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

// ── Android mobile primitives (docs/android/11-design-and-coding-patterns.md §6–7) ─────
describe('pattern: bottom sheets are BottomSheet, not hand-rolled', () => {
  it('no sheetOverlay / sheetPanel CSS class outside components/BottomSheet/', () => {
    const cssFiles = walk(SRC, ['.css']).filter((f) => !rel(f).startsWith('src/components/BottomSheet/'));
    const hits = findMatches(cssFiles, /\.sheet(Overlay|Panel)\b/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: row actions are RowAction, so the Android long-press sheet can label them', () => {
  // HoverOptions' menu holds text options, not icon actions, and on Android shows an ActionSheet.
  const EXEMPT = new Set(['src/components/HoverOptions/HoverOptions.tsx']);
  it('no raw <button> inside a <RowHoverActionsMenu> or <RowOptionsMenu>', () => {
    const bad: string[] = [];
    for (const file of TSX_FILES) {
      if (EXEMPT.has(rel(file))) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<(RowHoverActionsMenu|RowOptionsMenu)\b[\s\S]*?<\/\1>/g)) {
        if (/<button\b/.test(m[0])) bad.push(`${rel(file)}: ${m[0].split('\n')[0].trim()}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('pattern: every hotkey names its touch path (decision D13)', () => {
  it("every HOTKEYS entry has a non-empty touch: the path, or 'n/a: <why>'", () => {
    const src = fs.readFileSync(path.join(SRC, 'config', 'hotkeys.ts'), 'utf8');
    const defs = [...src.matchAll(/^\s*\{\s*id:\s*'([^']+)'.*$/gm)].map((m) => ({ id: m[1], touch: /touch:\s*'((?:[^'\\]|\\.)*)'/.exec(m[0])?.[1] ?? '' }));
    expect(defs.length).toBeGreaterThan(40);
    // An n/a must say why: "n/a: …" (or "n/a for now: …").
    const bad = defs.filter((h) => !h.touch.trim() || (/^n\/a\b/i.test(h.touch) && !/^n\/a[^:]*: \S/.test(h.touch)));
    expect(bad.map((h) => h.id)).toEqual([]);
  });
});

describe('pattern: services/trash.ts stays out of stores and trashCapture.ts (import cycle)', () => {
  it('no store and not trashCapture.ts imports services/trash', () => {
    const hits = findMatches(
      SOURCE_FILES.filter((f) => rel(f).startsWith('src/store/') || rel(f) === 'src/services/trashCapture.ts'),
      /from '@\/services\/trash'/,
    );
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: the Android back button is the Escape stack', () => {
  it('no fixed overlay list: closeTopmostMobileOverlay is gone, and App.tsx calls closeTopOverlay', () => {
    expect(findMatches(SOURCE_FILES, /closeTopmostMobileOverlay/)).toEqual([]);
    expect(fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8')).toMatch(/closeTopOverlay\(\)/);
  });
});

// Backup restore must reload every store syncService uploads before force-uploading, or the upload
// sends the pre-restore state over the restored data (notes/lists/… did exactly that until
// 2026-10-05). A new synced store goes in restoreBackupData's rehydrate list too.
describe('backup restore rehydrates every synced store', () => {
  it('restoreBackupData rehydrates each store syncService.ts imports', () => {
    const sync = fs.readFileSync(path.join(SRC, 'services', 'sync', 'syncService.ts'), 'utf8');
    const backup = fs.readFileSync(path.join(SRC, 'utils', 'backupExport.ts'), 'utf8');
    const synced = [...sync.matchAll(/import \{ (use\w+Store) \} from '@\/store\/\w+'/g)].map((m) => m[1]);
    expect(synced.length).toBeGreaterThan(5);
    for (const store of synced) expect(backup, store).toContain(`${store}.persist.rehydrate()`);
  });
});

// Notifications (CLAUDE.md "Notifications — one set of rules"): WHEN something notifies is decided by
// services/notifications/plan.ts alone. Delivery has exactly one caller per platform, so nothing can
// fire or book a notification on rules of its own (the 2026-09-27 Deadline kind was missed that way).
describe('pattern: notifications are delivered only from the planned paths', () => {
  it('fireOSNotification is called only by the desktop/web checker; LocalNotifications.schedule only by the Android scheduler', () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      const r = rel(f);
      if (r.endsWith('.test.ts') || r.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(f, 'utf8');
      if (/fireOSNotification\(/.test(content) && !['src/hooks/useNotificationChecker.ts', 'src/services/notificationService.ts'].includes(r)) offenders.push(`${r}: fireOSNotification`);
      if (/LocalNotifications\.schedule\(/.test(content) && r !== 'src/services/notifications/androidScheduler.ts') offenders.push(`${r}: LocalNotifications.schedule`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('pattern: special characters work in every text field (CLAUDE.md "Special characters")', () => {
  it('App installs the field listener once, and the note editor has the extension', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    const editorSrc = fs.readFileSync(path.join(SRC, 'components/NoteEditor/NoteEditor.tsx'), 'utf8');
    expect(app).toContain('installSpecialCharInput()');
    expect(editorSrc).toMatch(/\n\s+SpecialCharInput,\r?\n/);
  });
  it('nothing but src/specialChars/charSets.ts lists Greek letters by name', () => {
    const files = SOURCE_FILES.filter((f) => !/specialChars[/\\]charSets\.ts$/.test(f));
    const hits = findMatches(files, /\['(alpha|lambda|omega)', '[αλω]'/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: charts go through one neutral spec and one adapter (CLAUDE.md "Charts")', () => {
  // The library must stay swappable and lazy-loaded: nothing but the adapter names it.
  it('only src/charts/chartAdapter.ts imports the charting library', () => {
    const files = SOURCE_FILES.filter((f) => !/charts[/\\]chartAdapter\.ts$/.test(f));
    const hits = findMatches(files, /from 'chart\.js|import\('chart\.js/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: an item kind has one icon, from config/itemIcons.ts', () => {
  // Deadlines were ⏳ in one place, 🚩 in another and ⏰ (the reminder's) in a third.
  it('no source file but itemIcons.ts spells out the reminder, deadline or task icon', () => {
    const files = SOURCE_FILES.filter((f) => !f.endsWith('itemIcons.ts'));
    const hits = findMatches(files, /'(⏰|🏁|☑️)'/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: linked text is drawn by objects/artifactGroups.ts, once per link', () => {
  // A CSS ::before/::after on the mark element repeats on every line and around every bold word
  // (ProseMirror splits a mark into one element per piece) — the bug the grouping fixed.
  it('no CSS draws content on mark[data-artifact-…] itself', () => {
    const css = walk(SRC, ['.css']);
    const hits = findMatches(css, /mark\[data-artifact[^\]]*\][^{]*::?(before|after)/);
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('every `\` object kind is in NOTE_OBJECT_KINDS and only the registry builds the menu', () => {
    const kindFiles = SOURCE_FILES.filter((f) => /NoteEditor[\/]objects[\/].*Kind\.ts$/.test(f));
    const registry = fs.readFileSync(path.join(SRC, 'components/NoteEditor/objects/kinds.ts'), 'utf8');
    const missing = kindFiles
      .map((f) => path.basename(f, '.ts'))
      .filter((name) => !new RegExp(`NOTE_OBJECT_KINDS[^=]*=\s*\[[^\]]*\b${name}\b`).test(registry));
    expect(missing).toEqual([]);
  });

  it('suite-wide icons come from components/Icons: no local text-colour swatch, no old ItemActions icons path', () => {
    const css = walk(SRC, ['.css']).filter((f) => !/components[/\\]Icons[/\\]/.test(f));
    const swatches = findMatches(css, /conic-gradient\(/);
    expect(swatches, describeHits(swatches)).toEqual([]);
    const oldPath = findMatches(SOURCE_FILES, /ItemActions\/icons/);
    expect(oldPath, describeHits(oldPath)).toEqual([]);
  });

  it('every note block offers its designs through blockDesigns (Block designs)', () => {
    const blockFiles = SOURCE_FILES.filter((f) => /NoteEditor[/\\]objects[/\\].*Block\.ts$/.test(f));
    const offenders: string[] = [];
    for (const f of blockFiles) {
      const src = fs.readFileSync(f, 'utf8');
      const ext = src.match(/from '\.\.\/extensions\/(\w+)'/)?.[1];
      if (!ext) { offenders.push(`${path.basename(f)}: no extension`); continue; }
      const extSrc = fs.readFileSync(path.join(SRC, 'components/NoteEditor/extensions', `${ext}.ts`), 'utf8');
      if (!/from '\.\/blockDesigns'/.test(extSrc) || !/designButtons\(/.test(extSrc) || !/_DESIGNS: BlockDesign</.test(extSrc)) offenders.push(`${ext}.ts`);
      // …and can be selected whole: the pill's Select button, and data-note-block on its root.
      if (!/selectButton\(view, getPos\)/.test(extSrc) || !/'data-note-block': ''/.test(extSrc)) offenders.push(`${ext}.ts: select`);
      // …and can be framed: Outline and Shade.
      if (!/\.\.\.blockFrameAttributes\(\)/.test(extSrc) || !/frameButtons\(view, getPos/.test(extSrc)) offenders.push(`${ext}.ts: frames`);
    }
    expect(offenders).toEqual([]);
  });

  it('no CSS draws content on [data-concept-ref] (text linked to a Glossary term) itself', () => {
    const css = walk(SRC, ['.css']);
    const hits = findMatches(css, /\[data-concept-ref[^\]]*\][^{]*::?(before|after)/);
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('every note block is in NOTE_BLOCK_KINDS, and the editor registers the timeline nodes', () => {
    const blockFiles = SOURCE_FILES.filter((f) => /NoteEditor[/\\]objects[/\\].*Block\.ts$/.test(f));
    const registry = fs.readFileSync(path.join(SRC, 'components/NoteEditor/objects/blockKinds.ts'), 'utf8');
    const list = registry.slice(registry.indexOf('NOTE_BLOCK_KINDS'));
    const missing = blockFiles.map((f) => path.basename(f, '.ts')).filter((name) => !list.includes(name));
    expect(missing).toEqual([]);
    const editorSrc = fs.readFileSync(path.join(SRC, 'components/NoteEditor/NoteEditor.tsx'), 'utf8');
    expect(editorSrc).toContain('...TimelineExtensions');
    expect(editorSrc).toContain('...QuoteExtensions');
    expect(editorSrc).toContain('...CycleExtensions');
    expect(editorSrc).toContain('...BreakdownExtensions');
    expect(editorSrc).toContain('...HierarchyExtensions');
    expect(editorSrc).toContain('...PyramidExtensions');
    expect(editorSrc).toContain('...ChartExtensions');
  });
});

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
  const CAPTURE_EXCEPTIONS = [{ file: 'src/components/SettingsPane/SettingsPane.tsx', text: "if (e.key === 'Escape') { setListening(null); return; }" }];
  // A handler that deliberately does nothing to Escape (explicit early-return, letting it
  // bubble untouched to the Escape stack) rather than consuming it — not a stopPropagation
  // case at all, so it can't be found by scanning for that call.
  const PASS_THROUGH_EXCEPTIONS = [{ file: 'src/components/NoteEditor/NoteBacklinks.tsx', text: "if (e.key === 'Escape' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;" }];

  it("every source hit of the literal 'Escape' either lives in the mechanism itself, or is an inline handler that calls stopPropagation (within a few lines), or a documented exception", () => {
    const bad: string[] = [];
    for (const file of SOURCE_FILES) {
      const relPath = rel(file);
      if (ALLOWED_FILES.has(relPath)) continue;
      const lines = linesOf(file);
      lines.forEach((text, i) => {
        if (!/'Escape'/.test(text)) return;
        const key = `${relPath}:${i + 1}`;
        const excepted = (list: { file: string; text: string }[]) => list.some((x) => x.file === relPath && text.trim() === x.text);
        if (excepted(CAPTURE_EXCEPTIONS) || excepted(PASS_THROUGH_EXCEPTIONS)) return;
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

  // Tightened 2026-10-17, when the Notes ribbon's table, columns and colour dropdowns and five
  // Portfolio panels were found closing on an outside click but not on Escape: their files each
  // had ONE useEscapeClose (for another overlay), which the check above accepted. Now every
  // outside-click listener on the document (click, mousedown or pointerdown, .ts files too) needs
  // an Escape registration of its own.
  it('every outside-click listener on the document has its own Escape registration', () => {
    // Listeners that aren't an overlay closing: App.tsx opens external links, useLongPress
    // swallows the click its release makes.
    const NOT_OVERLAYS = new Set(['src/App.tsx', 'src/hooks/useLongPress.ts']);
    const bad = SOURCE_FILES.filter((f) => !NOT_OVERLAYS.has(rel(f))).flatMap((f) => {
      const src = fs.readFileSync(f, 'utf8');
      const listeners = (src.match(/document\.addEventListener\(['"](?:click|mousedown|pointerdown)['"]/g) ?? []).length;
      const escapes = (src.match(/\b(?:useEscapeClose|registerEscapeClose)\(/g) ?? []).length;
      return listeners > escapes ? [`${rel(f)}: ${listeners} outside-click listener(s), ${escapes} Escape registration(s)`] : [];
    });
    expect(bad, bad.join(', ')).toEqual([]);
  });
});

describe('pattern: floating panels are placed by utils/floatingPlacement.ts', () => {
  // Adopted 2026-10-17 (CLAUDE.md "Floating panels are always fully on screen"). A panel that
  // works out its own place from the window's height can open with its bottom off the screen
  // (the backdrop picker did). Every older site moved to the helper on 2026-10-17; NOT_YET is
  // kept for a site found later, listed in BACKLOG.md's Pattern retrofit backlog. Not panels:
  // StickyNotes (a note dragged on screen) and TaskPane (a textarea's height).
  const NOT_YET = new Set<string>([]);
  const NOT_PANELS = new Set(['src/components/StickyNotes/StickyNotes.tsx', 'src/components/TaskPane/TaskPane.tsx', 'src/utils/floatingPlacement.ts']);

  it('no new file places a panel from window.innerHeight itself', () => {
    const bad = SOURCE_FILES.map(rel)
      .filter((f) => !NOT_YET.has(f) && !NOT_PANELS.has(f))
      .filter((f) => /window\.innerHeight/.test(fs.readFileSync(path.join(SRC, '..', f), 'utf8')));
    expect(bad, bad.join(', ')).toEqual([]);
  });

  it('the not-yet list holds only files that still need moving', () => {
    const done = [...NOT_YET].filter((f) => !/window\.innerHeight/.test(fs.readFileSync(path.join(SRC, '..', f), 'utf8')));
    expect(done, `${done.join(', ')}: remove from NOT_YET and from BACKLOG.md`).toEqual([]);
  });
});

describe('pattern: marks show in the margin through the margin column (extensions/MarginColumn.ts)', () => {
  // Adopted 2026-10-17 (CLAUDE.md "The margin column"): a kind of mark registers a source with
  // registerMarginSource; nothing else draws beside the text (the old Important markers and the
  // Glossary braces and labels each drew their own, and didn't line up).
  it('only MarginColumn.ts draws the margin, and the old margin pieces are gone', () => {
    const bad = SOURCE_FILES.map(rel).filter((f) => f !== 'src/components/NoteEditor/extensions/MarginColumn.ts')
      .filter((f) => /['"]data-margin-(column|strip|row|icon|tick|bracket)['"]|data-importance-marker|data-concept-label|data-concept-margin/.test(fs.readFileSync(path.join(SRC, '..', f), 'utf8')));
    expect(bad, bad.join(', ')).toEqual([]);
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
  // the migration 022 entry in docs/supabase/migrations.md ("grant … for every table added by 008/012/018/019/020/021").
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

  it('every migration file is listed in docs/supabase/migrations.md (its Migration history)', () => {
    const record = fs.readFileSync(path.join(ROOT, 'docs', 'supabase', 'migrations.md'), 'utf8');
    const missing = migrationFiles.filter((f: string) => !record.includes(f));
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

describe('pattern: one repeat-rule editor (RepeatField)', () => {
  it('only components/RepeatField draws the "every N … / ends …" editor', () => {
    // Its tell is the "Ends" choice. Routines pick weekdays instead, a different control.
    const files = SOURCE_FILES.filter((f) => f.endsWith('.tsx') && !/components[/\\]RepeatField[/\\]/.test(f));
    const hits = findMatches(files, /<option value="forever"|value=\{\w*\.?endKind\}|setRepeatEndKind/);
    expect(hits, describeHits(hits)).toEqual([]);
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
    const hits = findMatches(files, /'(⏰|🏁|🔨)'/, { skipComments: true });
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

  // Repaired 2026-10-09: written with its backslashes lost, it matched no file on Windows and so
  // passed without checking anything. The guard below stops it passing empty-handed again.
  it('every `\\` object kind (objects/*Kind.ts) is in NOTE_OBJECT_KINDS', () => {
    const kindFiles = SOURCE_FILES.filter((f) => /NoteEditor[/\\]objects[/\\][^/\\]*Kind\.ts$/.test(f));
    expect(kindFiles.length).toBeGreaterThan(0);
    const registry = fs.readFileSync(path.join(SRC, 'components/NoteEditor/objects/kinds.ts'), 'utf8');
    const list = registry.slice(registry.indexOf('=', registry.indexOf('NOTE_OBJECT_KINDS')));
    const listed = list.slice(0, list.indexOf(']') + 1);
    const missing = kindFiles
      .map((f) => path.basename(f, '.ts'))
      .filter((name) => !new RegExp(`\\b${name}\\b`).test(listed));
    expect(missing).toEqual([]);
  });

  it('suite-wide icons come from components/Icons: no local text-colour swatch, no old ItemActions icons path', () => {
    const css = walk(SRC, ['.css']).filter((f) => !/components[/\\]Icons[/\\]/.test(f));
    const swatches = findMatches(css, /conic-gradient\(/);
    expect(swatches, describeHits(swatches)).toEqual([]);
    const oldPath = findMatches(SOURCE_FILES, /ItemActions\/icons/);
    expect(oldPath, describeHits(oldPath)).toEqual([]);
  });

  it('edit, close, delete and link controls are icons, not typed characters (✎ × ✕ 🔗; 2026-10-18)', () => {
    const files = SOURCE_FILES.filter((f) => !/components[/\\]Icons[/\\]/.test(f));
    // ✎ and ✕ have no other use; × only as a button's content, an icon or a widget's text (it stays
    // as a multiplication sign: 3×4, "× 2"); 🔗 only as an item kind's icon (config/itemIcons.ts, the
    // task-link kinds, the fallback object icon, a field type's icon).
    const typed = findMatches(files, /[✎✕]|>\s*×\s*<|icon[=:]\s*["']×|textContent = '×'|this\.button\('×'/, { skipComments: true });
    expect(typed, describeHits(typed)).toEqual([]);
    // The rest of the control glyphs (2026-10-18): archive ⊘, restore/reset ↺, open ↗, indent ↳ ↰,
    // colours/designs/status ◐ ◫, a table ▦, and the + speed dial's ◎ ▤ ✦ ◉ (Endeavour, Purpose,
    // presets, reminder). ↳ stays as the follow-up link kind's own icon (config/itemLinkKinds.ts).
    const glyphAllowed = /itemLinkKinds\.ts$/;
    const more = findMatches(files.filter((f) => !glyphAllowed.test(f)), /[⊘↺↗↳↰◐◫▦◎▤✦◉]/, { skipComments: true });
    expect(more, describeHits(more)).toEqual([]);
    const linkAllowed = /itemIcons\.ts$|itemLinkKinds\.ts$|artifactTypes\.ts$|CrossAppRefPicker\.tsx$|EditActivityTypeModal\.tsx$|EditTrackerPane\.tsx$/;
    const links = findMatches(files.filter((f) => !linkAllowed.test(f)), /🔗/, { skipComments: true });
    expect(links, describeHits(links)).toEqual([]);
  });

  it('expand/collapse arrows are DisclosureIcon: no ▸/▾ glyph toggled by hand, no local rotate-on-open chevron', () => {
    // A dropdown trigger's ▾ (it opens a list) and the right-click menu's submenu ▸ are other
    // meanings and aren't caught: they don't toggle between two arrows. CollectionPicker's trigger
    // does (▴ while its list is open) and is a dropdown, so it's the one exception.
    const files = SOURCE_FILES.filter((f) => !/components[/\\]Icons[/\\]/.test(f) && !/CollectionPicker\.tsx$/.test(f));
    const glyphToggle = findMatches(files, /\?\s*'[▸▾▴]'\s*:\s*'[▸▾▴]'/, { skipComments: true });
    expect(glyphToggle, describeHits(glyphToggle)).toEqual([]);
    const css = walk(SRC, ['.css']).filter((f) => !/components[/\\]Icons[/\\]/.test(f));
    const rotated = findMatches(css, /\.chevronOpen\b/);
    expect(rotated, describeHits(rotated)).toEqual([]);
  });

  it('icons beside text are sized from the text (Icons beside text): DisclosureIcon is 1em; the heading arrow is a 1em square on the first line', () => {
    const icon = fs.readFileSync(path.join(SRC, 'components/Icons/DisclosureIcon.tsx'), 'utf8');
    expect(icon).toMatch(/width="1em"/);
    expect(icon).toMatch(/height="1em"/);
    const css = fs.readFileSync(path.join(SRC, 'components/NoteEditor/NoteEditor.module.css'), 'utf8');
    const rule = css.match(/\.editorContent \[data-heading-fold\] \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/width: 1em;/);
    expect(rule).toMatch(/height: 1em;/);
    expect(rule).toMatch(/top: calc\(\(1lh - 1em\) \/ 2\);/);
  });

  it('side panels resize through usePaneWidth (Resizable side panels): every listed pane uses it, and no other col-resize', () => {
    const PANES = [
      'ChronicleView/ChronicleView.tsx', 'NoteEditor/NoteTOC.tsx', 'ListsSection/ListsSection.tsx', 'RecordsView/RecordsView.tsx',
      'OverviewSection/OverviewSection.tsx', 'CalendarSidePane/CalendarSidePane.tsx', 'ManagePane/ManagePane.tsx', 'TaskPane/TaskPane.tsx',
      'CalendarEventPane/CalendarEventPane.tsx', 'CalendarReminderPane/CalendarReminderPane.tsx', 'CalendarDeadlinePane/CalendarDeadlinePane.tsx',
      'EditRoutinePane/EditRoutinePane.tsx', 'EditTrackerPane/EditTrackerPane.tsx', 'NoteEditorPane/NoteEditorPane.tsx',
      'IntegrationsPane/IntegrationsPane.tsx', 'SettingsPane/SettingsPane.tsx', 'CalendarView/CalendarView.tsx', 'Sidebar/Sidebar.tsx',
      'WatchlistView/WatchlistView.tsx',
    ];
    const missing = PANES.filter((f) => !/usePaneWidth\(/.test(fs.readFileSync(path.join(SRC, 'components', f), 'utf8')));
    expect(missing).toEqual([]);
    const files = [...walk(SRC, ['.css']), ...SOURCE_FILES].filter((f) => !/components[/\\]ResizeHandle[/\\]/.test(f) && !/src[/\\]index\.css$/.test(f));
    const handRolled = findMatches(files, /col-resize/);
    expect(handRolled, describeHits(handRolled)).toEqual([]);
  });

  it('Ctrl+[ / Ctrl+] reach every block with designs: each *_DESIGNS list is in designCycle.ts', () => {
    const dir = path.join(SRC, 'components/NoteEditor/extensions');
    const cycle = fs.readFileSync(path.join(dir, 'designCycle.ts'), 'utf8');
    const missing: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/export const ([A-Z_]+_DESIGNS): BlockDesign</g)) {
        if (!new RegExp(`\\b${m[1]}\\b`).test(cycle)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
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

describe('pattern: app code logs through utils/log.ts (CLAUDE.md "Errors and logging")', () => {
  it('no console.* outside utils/log.ts and the test setup', () => {
    const files = SOURCE_FILES.filter((f) => !['src/utils/log.ts', 'src/test/setup.ts'].includes(rel(f)));
    const hits = findMatches(files, /\bconsole\.(log|info|warn|error|debug)\(/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
  it('no silently empty catch: an ignored error says why in a comment', () => {
    const hits = findMatches(SOURCE_FILES, /catch\s*(\(\w*\))?\s*\{\s*\}|\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
  it('the global error handlers are installed from main.tsx', () => {
    expect(fs.readFileSync(path.join(SRC, 'main.tsx'), 'utf8')).toContain('installGlobalErrorHandlers()');
  });
});

describe('pattern: styles use the design tokens in index.css (CLAUDE.md "Design tokens")', () => {
  // A ratchet, not a purge: these were the counts of hard-coded values when the tokens were
  // agreed (2026-10-09). Replace them as files are touched; the counts may only go down. When
  // this fails because a count went DOWN, lower the number here to lock the gain in. When it
  // fails because one went UP, use the token (var(--text-sm), var(--space-3), var(--z-toast)…).
  const BASELINE = { hex: 124, fontSize: 1218, zIndex: 136, radius: 303, shadow: 123 };
  const CSS = walk(SRC, ['.css']).filter((f) => f.endsWith('.module.css'))
    .map((f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
  const count = (re: RegExp) => CSS.reduce((n, s) => n + (s.match(re) ?? []).length, 0);
  const now = {
    hex:      count(/#[0-9a-fA-F]{3,8}\b/g),
    fontSize: count(/font-size:\s*[0-9.]+(rem|px|em)/g),
    zIndex:   count(/z-index:\s*-?[0-9]+/g),
    radius:   count(/border-radius:\s*[0-9.]+(px|rem|em)/g),
    // The value as a whole, so the lookahead can't be dodged by \s* backtracking to zero.
    shadow:   count(/box-shadow:\s*(?![\s]|var\(|none|inherit)[^;]*/g),
  };
  for (const key of Object.keys(BASELINE) as (keyof typeof BASELINE)[]) {
    it(`hard-coded ${key} values don't increase (now ${now[key]}, baseline ${BASELINE[key]})`, () => {
      expect(now[key]).toBeLessThanOrEqual(BASELINE[key]);
    });
  }
});

// ── Shared helpers that replaced copies (2026-10-09) ────────────────────────────────
describe('pattern: every block shows Delete in its pill (Block designs)', () => {
  it("no CSS hides a block's Delete button: it shows whenever the pill does, on hover", () => {
    const css = walk(SRC, ['.css']);
    const hits = findMatches(css, /\[data-block-delete\][^{]*\{[^}]*display:\s*none/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: formatted text in block fields (utils/richText.ts)', () => {
  it('every dangerouslySetInnerHTML is given sanitized text', () => {
    const hits = findMatches(SOURCE_FILES, /dangerouslySetInnerHTML=\{\{\s*__html:(?!\s*sanitizeInlineHtml\()/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
  it('a field is read with its formatting only by the card that draws it; everything else reads it plain', () => {
    const allowed = /(GlossaryCardBody\.tsx|structuredTagTypes\.ts)$/;
    const hits = findMatches(SOURCE_FILES.filter((f) => !allowed.test(f)), /\bfieldRich(List)?\(/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: one shared helper where copies used to be', () => {
  // Keyboard handlers decide "is the person typing?" with utils/typingTarget.ts, which also sees
  // into a custom element's shadow root (MathLive). speech/insertText.ts finds where to insert
  // dictated text, a different question.
  it('keyboard handlers ask isTypingTarget, never test tagName/isContentEditable themselves', () => {
    const files = SOURCE_FILES.filter((f) => !/utils[/\\]typingTarget\.ts$/.test(f) && !/speech[/\\]insertText\.ts$/.test(f));
    const hits = findMatches(files, /isContentEditable|tagName === 'TEXTAREA'|contentEditable === 'true'/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('a block typed in with a backslash is placed by replaceTypedWithBlock / placeBlock (blockDesigns.ts)', () => {
    const files = SOURCE_FILES.filter((f) => !/extensions[/\\]blockDesigns\.ts$/.test(f));
    const hits = findMatches(files, /canReplaceWith\(\$pos\.index\(d - 1\)/);
    expect(hits, describeHits(hits)).toEqual([]);
  });

  // A note's text changed from outside its editor goes through services/noteContentEdit.ts (through
  // the open editor when the text is open). NoteEditor's own save and the store are the only other
  // writers.
  it("a note's content is changed from outside the editor only through editNoteContent", () => {
    const allowed = /(services[/\\]noteContentEdit|NoteEditor[/\\]NoteEditor|store[/\\]noteStore)\.tsx?$/;
    // Shared test fixtures (src/test/) seed a note's content; that isn't a change made to a note.
    const files = SOURCE_FILES.filter((f) => !allowed.test(f) && !/src[/\\]test[/\\]/.test(f));
    const hits = findMatches(files, /updateNoteTabContent\(|updateNote\([^)]*\{\s*content\b/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });

  // One palette (config/swatches.ts): a picker never keeps its own list of colours.
  it('colour pickers use config/swatches.ts, never a local list of colours', () => {
    const files = SOURCE_FILES.filter((f) => !/config[/\\]swatches\.ts$/.test(f));
    const hits = findMatches(files, /const [A-Z_]*COLOU?RS\s*=\s*\[/);
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('every palette colour has its --color-swatch token in both themes', async () => {
    const { SWATCH_IDS } = await import('../config/swatches');
    const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
    const missing = SWATCH_IDS.flatMap((id) => [
      ...(light.includes(`--color-swatch-${id}:`) ? [] : [`${id} (light)`]),
      ...(dark.includes(`--color-swatch-${id}:`) ? [] : [`${id} (dark)`]),
    ]);
    expect(missing).toEqual([]);
  });

  it("a block's spectrum colours come from spectrumColour (blockDesigns.ts)", () => {
    const files = SOURCE_FILES.filter((f) => /NoteEditor[/\\]extensions[/\\]/.test(f) && !/blockDesigns\.ts$/.test(f));
    const hits = findMatches(files, /hsl\(\$\{/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: text on a primary fill uses --color-on-primary (CLAUDE.md "Design tokens")', () => {
  it('no rule that fills with --color-primary hard-codes white text', () => {
    const fill = /background(?:-color)?\s*:\s*var\(--color-primary(?:-hover)?\)\s*;/;
    const white = /(?<![-\w])color\s*:\s*(?:white|#fff|#ffffff)\b/i;
    const hits: string[] = [];
    for (const f of walk(SRC, ['.css']).filter((x) => x.endsWith('.module.css'))) {
      const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const block of css.match(/\{[^{}]*\}/g) ?? []) {
        if (fill.test(block) && white.test(block)) hits.push(`${path.relative(ROOT, f)}: ${block.slice(0, 80)}`);
      }
    }
    expect(hits, hits.join(' | ')).toEqual([]);
  });
});

describe('pattern: Pin to Quick Access (CLAUDE.md "Pin to Quick Access")', () => {
  it('only services/quickAccessPins.ts (and the demo builder) pins or unpins: every pin button and menu item goes through togglePin', () => {
    const allowed = new Set(['src/services/quickAccessPins.ts', 'src/demo/demoAccount.ts']);
    const hits = findMatches(SOURCE_FILES, /\b(pins|usePinnedItemsStore\.getState\(\)|store)\.(pin|unpin)\(/, { skipComments: true })
      .filter((h) => !allowed.has(h.file));
    expect(hits, describeHits(hits)).toEqual([]);
  });

  it('every pinnable type resolves through a Quick Access provider', () => {
    const storeSrc = fs.readFileSync(path.join(SRC, 'store', 'pinnedItemsStore.ts'), 'utf8');
    const qaSrc = fs.readFileSync(path.join(SRC, 'utils', 'quickAccess.ts'), 'utf8');
    const types = [...(/PINNABLE_TYPES: readonly PinnableType\[\] = \[([^\]]+)\]/.exec(storeSrc)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => !qaSrc.includes(`type: '${t}',`))).toEqual([]);
  });
});

describe('pattern: Places (CLAUDE.md "Places")', () => {
  const placesSrc = fs.readFileSync(path.join(SRC, 'config', 'places.ts'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(SRC, 'store', 'uiStore.ts'), 'utf8');
  const ids = [...placesSrc.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);

  it('every place is counted when opened, from anywhere (its uiStore open action records the visit)', () => {
    expect(ids.length).toBeGreaterThan(0);
    // A Notes view or tool names its place in config/noteViews.ts; uiStore.setNotesView records it.
    const viewsSrc = fs.readFileSync(path.join(SRC, 'config', 'noteViews.ts'), 'utf8');
    const viaNotesView = (id: string) => viewsSrc.includes(`place: '${id}'`) && uiSrc.includes("recordVisit('place', place)");
    const missing = ids.filter((id) => !uiSrc.includes(`recordVisit('place', '${id}')`) && !viaNotesView(id));
    expect(missing).toEqual([]);
  });

  it('Review is drawn with its own icon, never 🔁 (which is "repeats")', () => {
    const sites = [
      'components/NoteEditor/extensions/Importance.ts', 'components/NoteEditor/extensions/annotationMenu.ts',
      'components/NoteEditor/objects/SelectionMenu.tsx', 'components/NoteEditor/NoteTOC.tsx',
      'components/NotesSection/ReviewView.tsx', 'components/NotesSection/TagFAB.tsx',
    ];
    const hits = sites.filter((f) => fs.readFileSync(path.join(SRC, f), 'utf8').includes('🔁'));
    expect(hits).toEqual([]);
  });

  it('every place draws its icon from components/Icons, never an emoji typed in the registry', () => {
    expect(placesSrc).toMatch(/from '@\/components\/Icons'/);
    expect(placesSrc).not.toMatch(/icon:\s*'/);
    expect(placesSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('pattern: tests that fake the clock read "today" inside a test (CLAUDE.md "Testing")', () => {
  it('no todayIso() / new Date() / Date.now() at file or describe level in a test file that sets the time', () => {
    const files = walk(SRC, ['.ts', '.tsx']).filter((f) => /\.test\.tsx?$/.test(f) && /setSystemTime\(/.test(fs.readFileSync(f, 'utf8')));
    const hits = findMatches(files, /^ {0,2}(?:const|let|var) \w+(?::[^=]+)? = (?:todayIso\(\)|new Date\(\)|Date\.now\(\))/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: blocks with their own inputs take the typing (CLAUDE.md "Blocks with their own inputs")', () => {
  it('every one-unit (atom) note block that draws inputs of its own hands typed keys to them via typeIntoBlockPlugin', () => {
    const dir = path.join(SRC, 'components/NoteEditor/extensions');
    const offenders = fs.readdirSync(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).filter((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const atomWithView = /atom: true/.test(src) && /addNodeView\(/.test(src);
      const ownInputs = /createRoot\(|MathfieldElement|ChartWidget|createElement\('(?:input|textarea|select)'\)/.test(src);
      return atomWithView && ownInputs && !/typeIntoBlockPlugin\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe('pattern: offers made as you type come from one helper (CLAUDE.md "Offer as you type")', () => {
  it('only extensions/typingOffer.ts builds an offer chip', () => {
    const files = SOURCE_FILES.filter((f) => !/typingOffer\.ts$/.test(f) && !/\.test\.tsx?$/.test(f));
    const hits = findMatches(files, /setAttribute\('data-autolink-chip'/);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: automatic changes as you type are undoable straight after (CLAUDE.md "Automatic changes are undoable")', () => {
  it('every rich-text editor loads SpecialCharInput (its Mod-z undoes any input rule)', () => {
    const editors = SOURCE_FILES.filter((f) => /useEditor\(|new Editor\(/.test(fs.readFileSync(f, 'utf8')));
    expect(editors.length).toBeGreaterThan(0);
    const missing = editors.filter((f) => !/\bSpecialCharInput\b/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(missing).toEqual([]);
    expect(fs.readFileSync(path.join(SRC, 'components/NoteEditor/extensions/SpecialCharInput.ts'), 'utf8'))
      .toMatch(/'Mod-z':\s*\(\)\s*=>\s*this\.editor\.commands\.undoInputRule\(\)/);
  });

  it('text fields and typing offers take Ctrl+Z as well as Backspace', () => {
    for (const f of ['specialChars/fieldInput.ts', 'components/NoteEditor/extensions/typingOffer.ts']) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'), f).toMatch(/key === 'z'/);
    }
  });
});

describe('pattern: pictures are stored once, through services/pictures.ts (CLAUDE.md "Picture library")', () => {
  it('only the service, sync, backup and the sign-out wipe touch pictureStore', () => {
    const allowed = ['src/services/pictures.ts', 'src/services/sync/syncService.ts', 'src/utils/backupExport.ts', 'src/services/clearLocalData.ts', 'src/store/pictureStore.ts'];
    const hits = SOURCE_FILES.filter((f) => /@\/store\/pictureStore/.test(fs.readFileSync(f, 'utf8'))).map(rel).filter((r) => !allowed.includes(r));
    expect(hits).toEqual([]);
  });

  it('nothing compresses a picture to keep inline: only the library does (block icons are exempt, BACKLOG.md)', () => {
    const known = ['src/services/pictures.ts', 'src/utils/imageCompress.ts'];
    const hits = SOURCE_FILES.filter((f) => /compressImageBlob\(/.test(fs.readFileSync(f, 'utf8'))).map(rel).filter((r) => !known.includes(r));
    expect(hits).toEqual([]);
  });
});

describe('pattern: the editor library\'s classes are :global in scoped CSS (CLAUDE.md "Design tokens and theming")', () => {
  it('no .ProseMirror-… class in a *.module.css outside :global(…), where CSS Modules would rename it and the rule would match nothing', () => {
    const hits: string[] = [];
    for (const f of walk(SRC, ['.css']).filter((x) => x.endsWith('.module.css'))) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\.ProseMirror-[\w-]+/g)) {
          const before = line.slice(0, m.index);
          const open = before.lastIndexOf(':global(');
          if (open < 0 || before.indexOf(')', open) >= 0) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('pattern: marks on text keep out of the palette (CLAUDE.md "Colours a person picks")', () => {
  // The marks the app draws over words to say what they are. A new one joins this list.
  const TEXT_MARKS = ['[data-dict-word]', '[data-hub-ref]', '[data-autolink]', '[data-concept-ref]', '[data-concept-hover]', '[data-unsure-flag]', '[data-unsure-marker]'];
  it('no rule for a text mark uses a palette colour (--color-swatch-*), which is kept for colours a person picks', () => {
    const hits: string[] = [];
    for (const f of walk(SRC, ['.css'])) {
      const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (TEXT_MARKS.some((s) => m[1].includes(s)) && /--color-swatch-/.test(m[2])) hits.push(`${path.relative(ROOT, f)}: ${m[1].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
  it('a Dictionary word is shaded with the neutral text-mark token', () => {
    const css = fs.readFileSync(path.join(SRC, 'components', 'NoteEditor', 'NoteEditor.module.css'), 'utf8');
    const rule = css.match(/\.editorContent \[data-dict-word\] \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('var(--color-text-mark)');
  });
});

describe('pattern: every note block has a category (CLAUDE.md "Note blocks")', () => {
  it('each objects/*Block.ts names one of BLOCK_CATEGORIES', () => {
    const cats = fs.readFileSync(path.join(SRC, 'components/NoteEditor/objects/blockCategories.ts'), 'utf8');
    const ids = [...cats.matchAll(/\{ id: '(\w+)',/g)].map((m) => m[1]);
    const bad = SOURCE_FILES.filter((f) => /NoteEditor[/\\]objects[/\\].*Block\.ts$/.test(f)).filter((f) => {
      const m = fs.readFileSync(f, 'utf8').match(/category: '(\w+)'/);
      return !m || !ids.includes(m[1]);
    }).map((f) => path.basename(f));
    expect(ids.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});

describe('pattern: Notes views come from one registry (CLAUDE.md "Notes views")', () => {
  it('no per-view open flags or open/close actions (one uiStore.notesView instead)', () => {
    const hits = findMatches(SOURCE_FILES, /\bnotes(Glossary|Review|Hubs|Map)Open\b|\b(open|close)Notes(Glossary|Review|Hubs|Map)\b|\bnoteTagViewActive\b/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
  it('NotesSection renders through NOTE_VIEW_COMPONENTS, never importing a view itself', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/NotesSection/NotesSection.tsx'), 'utf8');
    expect(src).toContain('NOTE_VIEW_COMPONENTS');
    expect(src).not.toMatch(/import .*(ChronicleView|MobileNotes|GlossaryView|ReviewView|HubsView|MapView|TagView)\b/);
  });
  it('a view built on the browse model (components/NoteViews/) imports no store: it reads useNotesBrowse and acts through notesNav', () => {
    const dir = path.join(SRC, 'components', 'NoteViews');
    const files = fs.existsSync(dir) ? walk(dir, ['.ts', '.tsx']).filter((f) => !/\.test\.tsx?$/.test(f)) : [];
    const hits = findMatches(files, /from '@\/store\//);
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

describe('pattern: page hotkeys stand aside through pageKeyBlocked (CLAUDE.md "Page hotkeys stand aside")', () => {
  it('no hotkey guard lists open-state flags (openModal || editing… ) instead of asking pageKeyBlocked', () => {
    const hits = findMatches(SOURCE_FILES, /\bopenModal\s*\|\|\s*editing|if \(\w*\.?openModal\) return/, { skipComments: true });
    expect(hits, describeHits(hits)).toEqual([]);
  });
  it('every section-level hotkey handler asks pageKeyBlocked', () => {
    const files = ['components/CalendarView/CalendarView.tsx', 'components/ChronicleView/ChronicleView.tsx', 'components/ListsSection/ListsSection.tsx', 'components/NotesSection/NotesViewSwitcher.tsx'];
    const missing = files.filter((f) => !fs.readFileSync(path.join(SRC, f), 'utf8').includes('pageKeyBlocked('));
    expect(missing).toEqual([]);
  });
  // App.tsx's global handler: what acts on the page (new item, section keys, back/forward, the
  // filters) stands aside while an overlay is open, so Space in Manage can't open a new task below.
  it('the global hotkeys in App.tsx ask hasOpenOverlay, and stop before the page-acting ones', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    expect(app).toContain('const overOverlay = hasOpenOverlay();');
    const stop = app.search(/if \(overOverlay\) return;\s+if \(matchesHotkeyId\(e, 'nav-overview'\)\)/);
    expect(stop).toBeGreaterThan(-1);
    expect(app.indexOf("matchesHotkeyId(e, 'action-new-item')")).toBeGreaterThan(stop);
    expect(app.indexOf("matchesHotkeyId(e, 'action-endeavour')")).toBeGreaterThan(stop);
  });
});

describe('pattern: a note is named with its notebook (CLAUDE.md "A note is named with its notebook")', () => {
  // A bare `note.title || …` shown to the person. These places show the notebook another way:
  // inside the notebook already (NoteList, MobileNotes' notebook list), the note itself
  // (EditNoteMetaModal), with its path on a line of its own (describePlace, NotePickerModal),
  // grouped by notebook (TagView), the title already named by noteLinkTargets (NoteEmbed,
  // NoteLink), and Overview's title beside its Where column. A new place uses utils/notes noteName.
  const ALLOWED = new Set([
    'src/components/ChronicleView/NoteList.tsx', 'src/components/MobileNotes/MobileNotes.tsx', 'src/components/EditNoteMetaModal/EditNoteMetaModal.tsx',
    'src/components/HistoryBrowser/describePlace.ts', 'src/components/NotePickerModal/NotePickerModal.tsx', 'src/components/NotesSection/TagView.tsx',
    'src/components/NoteEditor/extensions/NoteEmbed.ts', 'src/components/NoteEditor/extensions/NoteLink.ts', 'src/overview/sources.ts',
  ]);
  it('no other place shows a bare note title', () => {
    const files = SOURCE_FILES.filter((f) => /src[/\\](components|overview)[/\\]/.test(f));
    const hits = findMatches(files, /\b(n|note|target)\??\.title\s*\|\|/, { skipComments: true }).filter((h) => !ALLOWED.has(h.file));
    expect(hits, describeHits(hits)).toEqual([]);
  });
});

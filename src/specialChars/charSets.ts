// Characters you can type by name, anywhere in the app: `//` then the name (`//alpha` → α,
// `//Delta` → Δ). THE table of them, and the pure rules for reading what's been typed, shared by
// every text field (fieldInput.ts) and the note editor (NoteEditor/extensions/SpecialCharInput.ts),
// so they behave the same everywhere. Sets: Greek letters, arrows, maths symbols, and superscript
// and subscript digits; another set is more entries here, with its own `set`.

export type CharSet = 'greek' | 'arrows' | 'maths' | 'scripts';

export interface SpecialChar {
  name:    string;        // as typed, lower case (the upper-case form is the capitalised name)
  char:    string;
  upper?:  string;        // the capital letter, typed with a capital first letter
  set:     CharSet;
  aliases?: string[];     // other things to type that find it (a look-alike Latin letter)
}

export const TRIGGER = '//';
const MAX_NAME = 12;

const GREEK: [string, string, string, string[]?][] = [
  ['alpha', 'α', 'Α'], ['beta', 'β', 'Β'], ['gamma', 'γ', 'Γ'], ['delta', 'δ', 'Δ'],
  ['epsilon', 'ε', 'Ε'], ['zeta', 'ζ', 'Ζ'], ['eta', 'η', 'Η', ['h']], ['theta', 'θ', 'Θ'],
  ['iota', 'ι', 'Ι'], ['kappa', 'κ', 'Κ'], ['lambda', 'λ', 'Λ'], ['mu', 'μ', 'Μ'],
  ['nu', 'ν', 'Ν', ['v']], ['xi', 'ξ', 'Ξ'], ['omicron', 'ο', 'Ο'], ['pi', 'π', 'Π'],
  ['rho', 'ρ', 'Ρ'], ['sigma', 'σ', 'Σ'], ['tau', 'τ', 'Τ'], ['upsilon', 'υ', 'Υ'],
  ['phi', 'φ', 'Φ', ['f']], ['chi', 'χ', 'Χ'], ['psi', 'ψ', 'Ψ'], ['omega', 'ω', 'Ω', ['w']],
];

// Lower-case forms only (they have no capital of their own).
const GREEK_VARIANTS: [string, string, string[]?][] = [
  ['varepsilon', 'ϵ'], ['vartheta', 'ϑ'], ['varpi', 'ϖ'], ['varrho', 'ϱ'],
  ['varsigma', 'ς', ['finalsigma']], ['varphi', 'ϕ'],
];

// Names follow LaTeX where it has one (`//leq`, `//implies`), so they're guessable.
const ARROWS: [string, string, string[]?][] = [
  ['to', '→', ['rarrow', 'rightarrow']], ['gets', '←', ['larrow', 'leftarrow']],
  ['uarrow', '↑', ['uparrow']], ['darrow', '↓', ['downarrow']], ['lrarrow', '↔'],
  ['implies', '⇒'], ['impliedby', '⇐'], ['iff', '⇔'], ['mapsto', '↦'],
];

const MATHS: [string, string, string[]?][] = [
  ['inf', '∞', ['infinity', 'infty']], ['pm', '±'], ['mp', '∓'], ['times', '×'], ['div', '÷'],
  ['cdot', '⋅', ['dot', 'dotprod']], ['middot', '·'], ['neq', '≠', ['ne']], ['approx', '≈'], ['equiv', '≡'], ['leq', '≤', ['le']],
  ['geq', '≥', ['ge']], ['ll', '≪'], ['gg', '≫'], ['propto', '∝'], ['sum', '∑'], ['prod', '∏'],
  ['sqrt', '√'], ['int', '∫', ['integral']], ['partial', '∂'], ['nabla', '∇'], ['deg', '°', ['degree']],
  ['prime', '′'], ['in', '∈'], ['notin', '∉'], ['subset', '⊂'], ['supset', '⊃'], ['cup', '∪', ['union']],
  ['cap', '∩', ['intersection']], ['forall', '∀'], ['exists', '∃'], ['empty', '∅', ['emptyset']],
  ['therefore', '∴'], ['because', '∵'],
];

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPTS   = '₀₁₂₃₄₅₆₇₈₉';
const SCRIPTS: [string, string][] = [
  ...[...SUPERSCRIPTS].map((c, i): [string, string] => [`sup${i}`, c]),
  ...[...SUBSCRIPTS].map((c, i): [string, string] => [`sub${i}`, c]),
  ['supplus', '⁺'], ['supminus', '⁻'], ['subplus', '₊'], ['subminus', '₋'],
];

export const SPECIAL_CHARS: SpecialChar[] = [
  ...GREEK.map(([name, char, upper, aliases]): SpecialChar => ({ name, char, upper, set: 'greek', aliases })),
  ...GREEK_VARIANTS.map(([name, char, aliases]): SpecialChar => ({ name, char, set: 'greek', aliases })),
  ...ARROWS.map(([name, char, aliases]): SpecialChar => ({ name, char, set: 'arrows', aliases })),
  ...MATHS.map(([name, char, aliases]): SpecialChar => ({ name, char, set: 'maths', aliases })),
  ...SCRIPTS.map(([name, char]): SpecialChar => ({ name, char, set: 'scripts' })),
];

// What's being typed, if the text before the cursor ends with `//name`: where the `//` starts and
// the name so far. Only at the start of a word (after a space, an opening bracket or quote, or at
// the start), so a URL's `https://` never starts it. A name starts with a letter and may end in
// digits (`//sup2`).
export function findCharTrigger(before: string): { start: number; query: string } | null {
  const m = /(^|[\s([{"'“‘«])\/\/((?:[A-Za-z][A-Za-z0-9]{0,11})?)$/.exec(before);
  if (!m) return null;
  return { start: m.index + m[1].length, query: m[2] };
}

export interface CharMatch { entry: SpecialChar; char: string; label: string }

// A capital first letter asks for a Greek capital; the other sets have no case, so it's ignored.
const asTyped = (entry: SpecialChar, capital: boolean): CharMatch | null => {
  if (capital && entry.set !== 'greek') capital = false;
  if (capital && !entry.upper) return null;
  const label = capital ? entry.name[0].toUpperCase() + entry.name.slice(1) : entry.name;
  return { entry, char: capital ? entry.upper! : entry.char, label };
};

// The characters a name so far could mean, best first: the exact name, then names that start with
// it (in alphabet order), then look-alike aliases. A capital first letter asks for capitals. An
// empty name lists the whole (lower-case) alphabet.
export function matchChars(query: string): CharMatch[] {
  if (query.length > MAX_NAME) return [];
  const capital = /^[A-Z]/.test(query);
  const q = query.toLowerCase();
  if (!q) return SPECIAL_CHARS.filter((e) => e.upper).map((e) => asTyped(e, false)!);
  const exact: CharMatch[] = [];
  const prefix: CharMatch[] = [];
  const alias: CharMatch[] = [];
  for (const e of SPECIAL_CHARS) {
    const m = asTyped(e, capital);
    if (!m) continue;
    if (e.name === q || e.aliases?.includes(q)) (e.name === q ? exact : alias).push(m);
    else if (e.name.startsWith(q)) prefix.push(m);
    else if (e.aliases?.some((a) => a.startsWith(q))) alias.push(m);
  }
  return [...exact, ...prefix, ...alias];
}

// The character a whole name means, for typing it out in full and a space: `//alpha ` → `α `.
export function exactChar(query: string): string | null {
  const capital = /^[A-Z]/.test(query);
  const e = SPECIAL_CHARS.find((x) => x.name === query.toLowerCase());
  if (!e) return null;
  if (e.set !== 'greek') return e.char;
  return capital ? (e.upper ?? null) : e.char;
}

// ── Shortcuts: characters you get just by typing their look-alike ────────────────────────────
// `-->` → →, `<=` → ≤, `!=` → ≠, `^2` → ² (the user's list, 2026-10-14). They replace as soon as
// the last character is typed; Backspace straight after puts the typed text back. Never in code
// (the note editor's code blocks and inline code) or in URL, email and search fields. THE table:
// both the text fields (fieldInput.ts) and the note editor (SpecialCharInput.ts) read it.
export const SHORTCUTS: { typed: string; char: string }[] = [
  { typed: '-->', char: '→' },
  { typed: '<--', char: '←' },
  { typed: '<=',  char: '≤' },
  { typed: '>=',  char: '≥' },
  { typed: '!=',  char: '≠' },
];

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

// Common chemical formulas, which get their digits as subscripts (`CO2` → CO₂) as the last
// character is typed, the same as the shortcuts above (the user's ask, 2026-10-16). Only whole
// words and exact case, so `co2` and `MCO2` are left alone. Left out on purpose: H2 (a year's
// second half, an HTML heading), F2 (the key) and I2.
export const CHEMICAL_FORMULAS: ReadonlySet<string> = new Set([
  'O2', 'O3', 'N2', 'Cl2', 'Br2', 'H2O', 'H2O2', 'H2S', 'CO2', 'SO2', 'SO3', 'NO2', 'N2O', 'N2O4',
  'NH3', 'CH4', 'C2H2', 'C2H4', 'C2H6', 'C3H8', 'C4H10', 'C8H18', 'CH2O', 'CH3OH', 'C2H5OH',
  'CH3COOH', 'C6H12O6', 'H2SO4', 'HNO3', 'H3PO4', 'H2CO3', 'HClO4', 'CaCO3', 'NaHCO3', 'Na2CO3',
  'K2CO3', 'CaCl2', 'MgCl2', 'CaSO4', 'MgSO4', 'CuSO4', 'KNO3', 'NaNO3', 'KMnO4', 'Fe2O3', 'Fe3O4',
  'Al2O3', 'SiO2', 'TiO2', 'P4O10',
]);

// The formula word the text before the cursor ends with (subscripts read as digits, so `H₂O2`
// is H2O2), with its digits as subscripts.
function findFormula(before: string): { start: number; char: string; typed: string } | null {
  const m = /(?:^|[^\p{L}\p{N}])([A-Z][A-Za-z0-9₀-₉]*)$/u.exec(before);
  if (!m) return null;
  const word = m[1];
  const plain = word.replace(/[₀-₉]/g, (d) => String(SUBSCRIPT_DIGITS.indexOf(d)));
  if (!CHEMICAL_FORMULAS.has(plain)) return null;
  const char = plain.replace(/[0-9]/g, (d) => SUBSCRIPT_DIGITS[Number(d)]);
  if (char === word) return null;
  return { start: before.length - word.length, char, typed: word };
}

// The shortcut the text before the cursor has just completed, if any (`before` ends with the
// character just typed): what to replace from `start` to the end, and with what. `^` and a digit
// give the superscript digit; a digit typed straight after a superscript digit stays superscript,
// so `^23` gives ²³. A chemical formula's digits become subscripts (CHEMICAL_FORMULAS).
export function findShortcut(before: string): { start: number; char: string; typed: string } | null {
  for (const s of SHORTCUTS) {
    if (before.endsWith(s.typed)) return { start: before.length - s.typed.length, char: s.char, typed: s.typed };
  }
  const sup = /(\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])([0-9])$/.exec(before);
  if (sup) {
    const char = SUPERSCRIPT_DIGITS[Number(sup[2])];
    return sup[1] === '^'
      ? { start: sup.index, char, typed: sup[0] }
      : { start: before.length - 1, char, typed: sup[2] };
  }
  return findFormula(before);
}

// ── The person's own shortcuts: a word that becomes longer text (`govt` → government) ───────────
// Managed in Settings → Typing shortcuts (settingsStore.textShortcuts, the user's ask, 2026-10-17).
// Unlike the shortcuts above, these replace only once the word is finished (a space or punctuation
// typed after it), so `tech` doesn't fire halfway through "technical". A shortcut written in lower
// case also matches it capitalised (`Govt` → Government) or in capitals (`GOVT` → GOVERNMENT), as
// word processors' autocorrect does. Backspace or Ctrl+Z straight after puts the typed text back.
export interface TextShortcut { id: string; typed: string; text: string }

// The starter set, everyone's from the start (the user's list, 2026-10-17; they vetoed asap, imo,
// tbc, diff and prob). Installed once: a new install starts with them, an existing one got them in
// settingsStore v15, and one the person deletes never comes back. The ids are fixed, so the
// migration can tell them apart.
export const DEFAULT_TEXT_SHORTCUTS: readonly TextShortcut[] = ([
  ['govt', 'government'], ['tech', 'technology'], ['b/w', 'between'], ['w/', 'with'], ['w/o', 'without'],
  ['b/c', 'because'], ['abt', 'about'], ['approx', 'approximately'], ['esp', 'especially'],
  ['dept', 'department'], ['mgmt', 'management'], ['intl', 'international'], ['natl', 'national'],
  ['org', 'organisation'], ['env', 'environment'], ['ppl', 'people'], ['thru', 'through'], ['tho', 'though'],
  ['wrt', 'with respect to'], ['tbd', 'to be decided'], ['yr', 'year'], ['yrs', 'years'], ['hrs', 'hours'],
  ['mins', 'minutes'], ['ref', 'reference'], ['info', 'information'], ['eg', 'e.g.'], ['ie', 'i.e.'],
] as const).map(([typed, text]) => ({ id: `default-${typed}`, typed, text }));

// The defaults not already there (by what's typed), for the one-off install.
export const missingDefaultShortcuts = (list: readonly TextShortcut[]): TextShortcut[] =>
  DEFAULT_TEXT_SHORTCUTS.filter((d) => !list.some((s) => s.typed.toLowerCase() === d.typed.toLowerCase()));

export const SHORTCUT_TYPED_MAX = 30;
export const SHORTCUT_TEXT_MAX = 500;
const ENDS_WORD = /[\s.,;:!?)\]}"'”’…]/u;
// What may not come straight before a shortcut: a letter or digit (inside a word), or a
// character of a web address, email or path (`example.org`, `a@b.org`, `docs/govt`).
const NOT_BEFORE = /[\p{L}\p{N}./@_:\\]/u;

function inCase(word: string, typed: string, text: string): string | null {
  if (word === typed) return text;
  if (typed !== typed.toLowerCase() || word.toLowerCase() !== typed) return null;
  if (word.length > 1 && word === word.toUpperCase()) return text.toUpperCase();
  if (word[0] !== word[0].toLowerCase()) return text.charAt(0).toUpperCase() + text.slice(1);
  return null;
}

// The shortcut `before` has just finished (it ends with the space or punctuation just typed):
// what to replace from `start` to the end, and with what (the text, then that same character).
// The longest match wins.
export function findUserShortcut(before: string, list: readonly TextShortcut[]): { start: number; char: string; typed: string } | null {
  const end = before.slice(-1);
  if (!list.length || !end || !ENDS_WORD.test(end)) return null;
  const body = before.slice(0, -1);
  let best: { start: number; char: string; typed: string } | null = null;
  for (const s of list) {
    if (!s.typed || body.length < s.typed.length || (best && best.typed.length > s.typed.length)) continue;
    const start = body.length - s.typed.length;
    if (start > 0 && NOT_BEFORE.test(body[start - 1])) continue;
    const word = body.slice(start);
    const text = inCase(word, s.typed, s.text);
    // Ending in the punctuation just typed already (`eg.` → e.g.), it doesn't get it twice.
    if (text !== null) best = { start, char: /\s/.test(end) || !text.endsWith(end) ? text + end : text, typed: word + end };
  }
  return best;
}

// Why a shortcut can't be saved, or null when it can. `id` is the one being edited (it may keep
// its own `typed`).
export function textShortcutProblem(typed: string, text: string, list: readonly TextShortcut[], id?: string): 'typedEmpty' | 'typedSpace' | 'typedLong' | 'textEmpty' | 'textLong' | 'duplicate' | null {
  if (!typed) return 'typedEmpty';
  if (/\s/.test(typed)) return 'typedSpace';
  if (typed.length > SHORTCUT_TYPED_MAX) return 'typedLong';
  if (!text.trim()) return 'textEmpty';
  if (text.length > SHORTCUT_TEXT_MAX) return 'textLong';
  if (list.some((s) => s.id !== id && s.typed.toLowerCase() === typed.toLowerCase())) return 'duplicate';
  return null;
}

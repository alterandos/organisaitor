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

// The shortcut the text before the cursor has just completed, if any (`before` ends with the
// character just typed): what to replace from `start` to the end, and with what. `^` and a digit
// give the superscript digit; a digit typed straight after a superscript digit stays superscript,
// so `^23` gives ²³.
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
  return null;
}

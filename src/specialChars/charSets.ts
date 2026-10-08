// Characters you can type by name, anywhere in the app: `//` then the name (`//alpha` → α,
// `//Delta` → Δ). THE table of them, and the pure rules for reading what's been typed, shared by
// every text field (fieldInput.ts) and the note editor (NoteEditor/extensions/SpecialCharInput.ts),
// so they behave the same everywhere. Greek first; another set is more entries here, with its own
// `set`.

export type CharSet = 'greek';

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

export const SPECIAL_CHARS: SpecialChar[] = [
  ...GREEK.map(([name, char, upper, aliases]): SpecialChar => ({ name, char, upper, set: 'greek', aliases })),
  ...GREEK_VARIANTS.map(([name, char, aliases]): SpecialChar => ({ name, char, set: 'greek', aliases })),
];

// What's being typed, if the text before the cursor ends with `//name`: where the `//` starts and
// the name so far. Only at the start of a word (after a space, an opening bracket or quote, or at
// the start), so a URL's `https://` never starts it.
export function findCharTrigger(before: string): { start: number; query: string } | null {
  const m = /(^|[\s([{"'“‘«])\/\/([A-Za-z]{0,12})$/.exec(before);
  if (!m) return null;
  return { start: m.index + m[1].length, query: m[2] };
}

export interface CharMatch { entry: SpecialChar; char: string; label: string }

const asTyped = (entry: SpecialChar, capital: boolean): CharMatch | null => {
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
  return capital ? (e.upper ?? null) : e.char;
}

// One number written four ways (asked for 2026-10-23): 69000000000 ⟷ 69,000,000,000 ⟷
// 6.9×10¹⁰ ⟷ 6.9E10. Pure and exact: a number is held as its digits and a power of ten, never as
// a float, so 0.1 or 12345678901234567890 come back unchanged. Used by the note editor's
// Ctrl+] / Ctrl+[ on a number and its right-click "Number format" (extensions/NumberNotation.ts).

export type Notation = 'plain' | 'grouped' | 'scientific' | 'e';
export const NOTATIONS: Notation[] = ['plain', 'grouped', 'scientific', 'e'];

// value = (neg ? -1 : 1) × digits × 10^exp; digits has no leading or trailing zeros ('0' for zero).
export interface ExactNumber { neg: boolean; digits: string; exp: number }

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const toSup = (n: number) => String(n).replace(/-/, '⁻').replace(/\d/g, (d) => SUP[Number(d)]);
const fromSup = (s: string) => s.replace('⁻', '-').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUP.indexOf(c)));

const MANTISSA = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const POWER = String.raw`(?:\s?[×x*·]\s?10(?:\^[-−]?\d+|⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)|[eE][+-]?\d+)`;
// A number standing on its own: not part of a word (CO2, v2) or of a longer run of digits and dots.
const NUMBER_RE = new RegExp(String.raw`(?<![\w.,])${MANTISSA}${POWER}?(?![\w]|[.,]\d)`, 'g');
const WHOLE_RE = new RegExp(`^(${MANTISSA})(${POWER})?$`);

export function parseNumber(text: string): ExactNumber | null {
  const m = WHOLE_RE.exec(text.trim());
  if (!m) return null;
  const neg = m[1].startsWith('-');
  const [int, frac = ''] = m[1].replace(/^-/, '').replace(/,/g, '').split('.');
  let exp = -frac.length;
  if (m[2]) {
    const p = m[2].replace(/\s/g, '');
    const e = /^[eE]/.test(p) ? p.slice(1) : p.includes('^') ? p.split('^')[1] : fromSup(p.slice(3));
    exp += Number(e.replace('−', '-'));
  }
  let digits = (int + frac).replace(/^0+/, '');
  if (!digits) return { neg: false, digits: '0', exp: 0 };
  const trailing = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - trailing);
  return { neg, digits, exp: exp + trailing };
}

function plainOf(n: ExactNumber): string {
  if (n.exp >= 0) return n.digits + '0'.repeat(n.exp);
  const pad = n.digits.padStart(-n.exp + 1, '0');
  return `${pad.slice(0, n.exp)}.${pad.slice(n.exp)}`;
}

export function formatNumber(n: ExactNumber, notation: Notation): string {
  const sign = n.neg ? '-' : '';
  if (notation === 'plain') return sign + plainOf(n);
  if (notation === 'grouped') {
    const [int, frac] = plainOf(n).split('.');
    return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
  }
  const power = n.digits.length - 1 + n.exp;
  const mantissa = n.digits.length > 1 ? `${n.digits[0]}.${n.digits.slice(1)}` : n.digits;
  return notation === 'scientific' ? `${sign}${mantissa}×10${toSup(power)}` : `${sign}${mantissa}E${power}`;
}

export function notationOf(text: string): Notation {
  if (/[×x*·]\s?10/.test(text)) return 'scientific';
  if (/\d[eE][+-]?\d/.test(text)) return 'e';
  if (text.includes(',')) return 'grouped';
  return 'plain';
}

// The same number in each notation that reads differently: a number under 1,000 has no grouping
// to add, and one from 1 to 9.99… no power of ten worth writing (7×10⁰).
export function numberForms(text: string): { notation: Notation; text: string }[] {
  const n = parseNumber(text);
  if (!n) return [];
  const power = n.digits.length - 1 + n.exp;
  const seen = new Set<string>();
  return NOTATIONS
    .filter((notation) => power !== 0 || notation === 'plain' || notation === 'grouped')
    .map((notation) => ({ notation, text: formatNumber(n, notation) }))
    .filter((f) => !seen.has(f.text) && seen.add(f.text));
}

// The next (or previous) way of writing it, wrapping round; null when there's only one.
export function cycleNotation(text: string, dir: 1 | -1): string | null {
  const forms = numberForms(text);
  if (forms.length < 2) return null;
  const exact = forms.findIndex((f) => f.text === text.trim());
  const at = Math.max(0, exact >= 0 ? exact : forms.findIndex((f) => f.notation === notationOf(text)));
  return forms[(at + dir + forms.length) % forms.length].text;
}

// The number around `offset` in a line of text (touching it counts), as [from, to).
export function numberAt(text: string, offset: number): { from: number; to: number } | null {
  for (const m of text.matchAll(NUMBER_RE)) {
    const from = m.index ?? 0;
    const to = from + m[0].length;
    if (offset >= from && offset <= to) return { from, to };
  }
  return null;
}

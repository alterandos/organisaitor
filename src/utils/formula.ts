import { LABELS } from '@/config/labels';

// Formulas a person writes (custom converters, and any later place that takes one): THE one place
// a formula is read and worked out, so it never goes near eval(). The syntax is mathjs's, kept to
// what converters need, so if mathjs is added later (decided with the user 2026-10-23: write our
// own now, maybe mathjs later) this file switches to it and every stored formula still works:
//   numbers 12, 0.5, 1e3 · + − × ÷ (also * /) · ^ (power, right to left) · ( )
//   pi (π), e · sqrt cbrt abs exp · log(x) natural, log(x, base), log10, log2, ln (ours, = log)
//   sin cos tan asin acos atan (radians) · round(x) / round(x, places) · floor ceil min max pow
//   names: the converter's own inputs (x, kg, height…)
// compileFormula reads it once (and says what's wrong, where); evaluate runs it for given inputs.

export interface Formula {
  variables: string[];                                   // the input names it uses
  evaluate:  (vars: Record<string, number>) => number;   // NaN when the answer isn't a real number
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const CONSTANTS: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E };

const FUNCTIONS: Record<string, { min: number; max: number; run: (...a: number[]) => number }> = {
  sqrt:  { min: 1, max: 1, run: Math.sqrt },
  cbrt:  { min: 1, max: 1, run: Math.cbrt },
  abs:   { min: 1, max: 1, run: Math.abs },
  exp:   { min: 1, max: 1, run: Math.exp },
  log:   { min: 1, max: 2, run: (x, base) => (base === undefined ? Math.log(x) : Math.log(x) / Math.log(base)) },
  ln:    { min: 1, max: 1, run: Math.log },
  log10: { min: 1, max: 1, run: Math.log10 },
  log2:  { min: 1, max: 1, run: Math.log2 },
  sin:   { min: 1, max: 1, run: Math.sin },
  cos:   { min: 1, max: 1, run: Math.cos },
  tan:   { min: 1, max: 1, run: Math.tan },
  asin:  { min: 1, max: 1, run: Math.asin },
  acos:  { min: 1, max: 1, run: Math.acos },
  atan:  { min: 1, max: 1, run: Math.atan },
  round: { min: 1, max: 2, run: (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; } },
  floor: { min: 1, max: 1, run: Math.floor },
  ceil:  { min: 1, max: 1, run: Math.ceil },
  min:   { min: 1, max: 99, run: Math.min },
  max:   { min: 1, max: 99, run: Math.max },
  pow:   { min: 2, max: 2, run: Math.pow },
};
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

const L = LABELS.formula;

// `allowed`: the input names it may use; anything else is an error (a typo, an input not made yet).
export function compileFormula(text: string, allowed?: readonly string[]): Formula {
  const src = text.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
  let i = 0;
  const vars = new Set<string>();
  const fail = (message: string): never => { throw new Error(L.at(message, i + 1)); };
  const space = () => { while (/\s/.test(src[i] ?? '')) i++; };
  const peek = () => { space(); return src[i]; };

  function expr(): Node {
    let a = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) { i++; a = { t: 'bin', op: c, a, b: term() }; }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (let c = peek(); c === '*' || c === '/'; c = peek()) { i++; a = { t: 'bin', op: c, a, b: unary() }; }
    return a;
  }
  function unary(): Node {
    const c = peek();
    if (c === '-') { i++; return { t: 'neg', a: unary() }; }
    if (c === '+') { i++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek() === '^') { i++; return { t: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom(): Node {
    const c = peek();
    if (c === undefined) return fail(L.endedEarly);
    if (c === '(') {
      i++;
      const inner = expr();
      if (peek() !== ')') fail(L.missingClose);
      i++;
      return inner;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return { t: 'num', v: Number(num[0]) }; }
    const name = /^[A-Za-z_π][\w]*/.exec(src.slice(i));
    if (!name) return fail(L.unexpected(c));
    const word = name[0];
    i += word.length;
    if (peek() === '(') {
      const fn = FUNCTIONS[word];
      if (!fn) return fail(L.unknownFunction(word));
      i++;
      const args: Node[] = [];
      if (peek() !== ')') {
        args.push(expr());
        while (peek() === ',') { i++; args.push(expr()); }
      }
      if (peek() !== ')') fail(L.missingClose);
      i++;
      if (args.length < fn.min || args.length > fn.max) fail(L.wrongArgs(word));
      return { t: 'call', fn: word, args };
    }
    if (word in CONSTANTS) return { t: 'num', v: CONSTANTS[word] };
    if (allowed && !allowed.includes(word)) return fail(L.unknownName(word));
    vars.add(word);
    return { t: 'var', name: word };
  }

  if (!src.trim()) throw new Error(L.empty);
  const tree = expr();
  if (peek() !== undefined) fail(L.unexpected(src[i]));

  const run = (n: Node, v: Record<string, number>): number => {
    switch (n.t) {
      case 'num':  return n.v;
      case 'var':  return v[n.name] ?? NaN;
      case 'neg':  return -run(n.a, v);
      case 'call': return FUNCTIONS[n.fn].run(...n.args.map((a) => run(a, v)));
      case 'bin': {
        const a = run(n.a, v), b = run(n.b, v);
        return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : a ** b;
      }
    }
  };
  return { variables: [...vars], evaluate: (v) => { const r = run(tree, v); return Number.isFinite(r) ? r : NaN; } };
}

// What's wrong with a formula, for showing beside the field; null when it's fine.
export function formulaError(text: string, allowed?: readonly string[]): string | null {
  try { compileFormula(text, allowed); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

// Long text in a field drawn outside the note editor (a Glossary card's long fields, an AI prompt's
// sections): lines and lists, agreed with the user 2026-11-14. Stored as lines, a list line written
// as Markdown writes it (`- ` a bullet, `1. ` a numbered item, two spaces per level in front), so
// everything that reads a field as text (search, copying, the agent, a prompt sent as Markdown)
// reads it as it looks. Pure: the lines read, and drawn as HTML for editing or showing. Reading the
// edited HTML back is components/LongText/longTextDom.ts.

export type LongList = 'ul' | 'ol';
export interface LongLine { list: LongList | null; depth: number; text: string }

const MARK = /^((?: {2})*)(- |\* |\d{1,3}\. )/;

// A line read: its list (if any), its level, and the text after the mark.
export function longLine(line: string): LongLine {
  const m = MARK.exec(line);
  if (!m) return { list: null, depth: 0, text: line };
  return { list: m[2].startsWith('-') || m[2].startsWith('*') ? 'ul' : 'ol', depth: m[1].length / 2, text: line.slice(m[0].length) };
}

// The mark a list line is written with: its level's spaces, then `- ` or its number.
export const longMark = (list: LongList, depth: number, n: number): string => `${'  '.repeat(depth)}${list === 'ul' ? '- ' : `${n}. `}`;

export const hasLongList = (lines: readonly string[]): boolean => lines.some((l) => MARK.test(l));

// The lines as HTML: a <div> per plain line, lists as <ul>/<ol> of <li>s, a deeper level nested in
// the one above (as the browser nests an indented item). `content` turns a line's text into HTML
// (escaped for plain text; a card's line is formatted text, cleaned).
export function longToHtml(lines: readonly string[], content: (text: string) => string): string {
  let out = '';
  const open: LongList[] = [];
  const closeTo = (n: number) => { while (open.length > n) out += `</${open.pop()}>`; };
  for (const raw of lines) {
    const line = longLine(raw);
    const html = content(line.text) || '<br>';
    if (!line.list) { closeTo(0); out += `<div>${html}</div>`; continue; }
    const depth = Math.min(line.depth, open.length);   // a level can't be skipped
    closeTo(depth + 1);
    if (open.length === depth + 1 && open[depth] !== line.list) closeTo(depth);
    while (open.length < depth + 1) { open.push(line.list); out += `<${line.list}>`; }
    out += `<li>${html}</li>`;
  }
  closeTo(0);
  return out;
}


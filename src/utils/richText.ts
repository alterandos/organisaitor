// A little formatted text inside a block's own fields (a Glossary card's term and fields): bold,
// italic, underline, strikethrough, superscript, subscript, inline code, line breaks, and links to
// Glossary terms (`<a data-term="entryId">`, 2026-10-22: its only attribute, the id checked),
// kept as a short HTML string. Everything that reads a field as text (search, the Glossary, copying, the
// agent) reads it plain through richToPlain; only the card draws it, through sanitizeInlineHtml.
// Pure and DOM-free, so it runs anywhere. Agreed with the user 2026-10-13.
//
// A stored value may also be plain text written before formatting existed, or by the agent: as
// HTML it reads the same, except that a "<" or ">" that isn't one of the tags below is kept as
// text (escaped), never dropped.

const KEEP: Record<string, string> = {
  b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', sup: 'sup', sub: 'sub', code: 'code', br: 'br',
};
// Wrappers an editable field adds (a line, a styled span): their text stays, the tag goes.
const UNWRAP = new Set(['span', 'div', 'p', 'font']);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g;

const escapeText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A link to a Glossary term: the entry id, nothing else (letters, digits, - and _ only).
const TERM_ID = /\bdata-term="([A-Za-z0-9_-]{1,64})"/;

// Only the tags above, with no attributes (a term link keeps just its checked id), and every
// other "<" kept as text: safe to put on a page.
export function sanitizeInlineHtml(html: string): string {
  let out = '';
  let last = 0;
  const open: string[] = [];
  for (const m of html.matchAll(TAG)) {
    out += escapeText(html.slice(last, m.index));
    last = m.index! + m[0].length;
    const name = m[2].toLowerCase();
    const kept = KEEP[name];
    if (name === 'a') {
      const id = !m[1] ? TERM_ID.exec(m[0])?.[1] : undefined;
      if (id) { open.push('a'); out += `<a data-term="${id}">`; }
      else if (m[1]) {
        const at = open.lastIndexOf('a');
        if (at >= 0) for (const t of open.splice(at).reverse()) out += `</${t}>`;
      }
      // Any other link: its text stays, the tag goes.
    } else if (kept === 'br') out += '<br>';
    else if (kept) {
      if (!m[1]) { open.push(kept); out += `<${kept}>`; }
      else {
        const at = open.lastIndexOf(kept);
        // A close that skips over tags opened inside it closes those too (badly nested input).
        if (at >= 0) for (const t of open.splice(at).reverse()) out += `</${t}>`;
      }
    } else if (!UNWRAP.has(name)) out += escapeText(m[0]);
  }
  out += escapeText(html.slice(last));
  for (const t of open.reverse()) out += `</${t}>`;
  return out.replace(/(<br>)+$/, '');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (all, e: string) => {
  if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
  if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
  return ENTITIES[e] ?? all;
});

// The text of a field, without its formatting. A line break reads as a new line.
export function richToPlain(value: string): string {
  if (!value.includes('<') && !value.includes('&')) return value;
  return decode(sanitizeInlineHtml(value).replace(/<br>/g, '\n').replace(/<\/?[a-z]+(?: data-term="[^"]*")?>/g, ''));
}

// Whether a value holds any formatting (otherwise it's stored as plain text).
export const hasFormatting = (value: string) => /<(b|i|u|s|sup|sub|code)>|<a data-term=/.test(sanitizeInlineHtml(value));

// The lines of an edited list (one item per line, as a contentEditable writes them: lines as
// <div>s, or <br>s), each cleaned; empty lines dropped.
export function richLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p)\b[^<>]*>/gi, '\n')
    .split('\n')
    .map((l) => sanitizeInlineHtml(l).trim())
    .filter((l) => richToPlain(l).trim() !== '');
}

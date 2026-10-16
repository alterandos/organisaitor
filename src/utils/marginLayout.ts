// The margin column's layout (NoteEditor/extensions/MarginColumn.ts), pure so it's tested without
// a browser. Agreed with the user 2026-10-17: marks whose passages start on the same line share a
// row, up to MAX_ICONS icons side by side and then a "+N"; a passage over several lines also gets a
// thin bracket down the lines it covers; rows never overlap, a row that would is moved down.

export const MAX_ICONS = 3;

export interface MarginSpan { key: string; top: number; bottom: number }
export interface MarginRow { top: number; keys: string[]; more: string[] }

// Rows from the passages' first-line tops (in the column's pixels), in reading order. `same` is how
// close two tops must be to count as one line; `rowHeight` is an icon row's height plus its gap.
export function layoutMarginRows(spans: readonly MarginSpan[], rowHeight: number, same = 4): MarginRow[] {
  const sorted = [...spans].sort((a, b) => a.top - b.top);
  const rows: { top: number; line: number; keys: string[] }[] = [];
  for (const s of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(s.top - last.line) <= same) last.keys.push(s.key);
    else rows.push({ top: s.top, line: s.top, keys: [s.key] });
  }
  let free = -Infinity;
  return rows.map((r) => {
    const top = Math.max(r.top, free);
    free = top + rowHeight;
    return { top, keys: r.keys.slice(0, MAX_ICONS), more: r.keys.slice(MAX_ICONS) };
  });
}

// Whether a passage runs over more than one line, so it gets a bracket.
export const spansLines = (s: MarginSpan, lineHeight: number) => s.bottom - s.top > lineHeight * 1.5;

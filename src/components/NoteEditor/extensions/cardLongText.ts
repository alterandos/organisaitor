import { linesAsBreaks, sanitizeInlineHtml } from '@/utils/richText';
import { longToHtml } from '@/utils/longText';
import { htmlToLongLines } from '@/components/LongText/longTextDom';

// A Glossary card's long fields (a textarea field: a Concept's In short, Explanation, Key points…)
// hold lines and lists (2026-11-14): stored as formatted lines joined by <br>, a list line with its
// Markdown mark (utils/longText.ts), so everything reading a field plain reads "- a point". Drawn
// as real lists while shown and edited; read back from the browser's editing by longTextDom.ts.

const storedLines = (stored: string): string[] => sanitizeInlineHtml(linesAsBreaks(stored)).split('<br>');

// What the field holds, drawn: lines and lists.
export const cardLongDraw = (stored: string): string => (stored ? longToHtml(storedLines(stored), (s) => s) : '');

// What was edited, as it's stored: each line cleaned (only the kept formatting), lists as marks.
export const cardLongClean = (edited: string): string =>
  htmlToLongLines(edited, { html: true }).map((l) => sanitizeInlineHtml(l)).join('<br>').replace(/(<br>)+$/, '');

// A stored value as cardLongClean would leave it (for "is this what's shown already?").
export const cardLongNormal = (stored: string): string => storedLines(stored).join('<br>').replace(/(<br>)+$/, '');

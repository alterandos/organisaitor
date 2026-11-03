import { namedFieldLine } from '@/config/structuredTagTypes';
import { readDate } from '@/utils/textToTask';
import type { ListFieldSchema } from '@/types/lists';

// Text sent from a note to a list (Send to ▸ A list…, agreed with the user 2026-11-03), as the items
// it would become: one item, or one per line. Each item's fields are filled where the text says
// what they are, and the person checks them before sending (SendToListModal). Pure.
//   - a line "Name: value" whose name is one of the list's fields fills that field;
//   - a web address fills the list's first link field;
//   - a date fills its first date field;
//   - a "Name: value" for a field the list doesn't have, and any other line after the first, go in
//     the item's notes, so nothing typed is lost.

export interface ListItemDraft { title: string; data: Record<string, unknown>; notes: string }

const MAX_TITLE = 120;
const BULLET = /^\s*(?:[-*•‣◦]|\d+[.)]|[a-z][.)])\s+/i;
const URL = /\bhttps?:\/\/[^\s<>"')]+/i;

// The text's lines, bullets and numbering taken off, empty ones dropped.
export function textLines(text: string): string[] {
  return text.split('\n').map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
}

// One draft from some text: its first line is the title (cut at a sentence end if long), the rest
// read for fields, else kept as notes.
export function draftFromText(text: string, fields: readonly ListFieldSchema[], now: Date = new Date()): ListItemDraft {
  const lines = textLines(text);
  const data: Record<string, unknown> = {};
  const notes: string[] = [];
  const byName = new Map(fields.map((f) => [f.name.trim().toLowerCase(), f]));
  let title = '';
  for (const line of lines) {
    const named = namedFieldLine(line);
    const field = named ? byName.get(named.label.trim().toLowerCase()) : undefined;
    if (named && field && named.value && data[field.id] === undefined) { data[field.id] = valueFor(field, named.value, now); continue; }
    if (!title) { title = line; continue; }
    notes.push(line);
  }
  if (title.length > MAX_TITLE) {
    const cut = title.slice(0, MAX_TITLE);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    const at = end > 20 ? end + 1 : cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : MAX_TITLE;
    notes.unshift(title.slice(at).trim());
    title = `${title.slice(0, at).trim()}${end > 20 ? '' : '…'}`;
  }
  const all = lines.join(' ');
  const url = URL.exec(all)?.[0];
  const urlField = fields.find((f) => f.type === 'url');
  if (url && urlField && data[urlField.id] === undefined) data[urlField.id] = url;
  const dateField = fields.find((f) => f.type === 'date');
  const date = dateField && data[dateField.id] === undefined ? readDate(all, now) : null;
  if (dateField && date) data[dateField.id] = date;
  return { title, data, notes: notes.join('\n') };
}

function valueFor(field: ListFieldSchema, value: string, now: Date): unknown {
  if (field.type === 'number') { const n = Number(value.replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : value; }
  if (field.type === 'date') return readDate(value, now) ?? value;
  if (field.type === 'boolean') return /^(y|yes|true|1|✓)$/i.test(value.trim());
  if (field.type === 'rating') { const n = parseInt(value, 10); return Number.isFinite(n) ? n : null; }
  if (field.type === 'select') return field.options?.find((o) => o.toLowerCase() === value.trim().toLowerCase()) ?? value;
  return value;
}

// The drafts for the text: one item, or (with several lines and `perLine`) one per line.
export function draftsFromText(text: string, fields: readonly ListFieldSchema[], perLine: boolean, now: Date = new Date()): ListItemDraft[] {
  const lines = textLines(text);
  if (!lines.length) return [];
  if (!perLine || lines.length < 2) return [draftFromText(text, fields, now)];
  return lines.map((l) => draftFromText(l, fields, now));
}

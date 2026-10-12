import type { Note } from '@/types/notes';

// Inboxes (the `\inbox` note block, NoteEditor extensions/Inbox.ts) read from stored note content,
// without an editor: for the Send to inbox picker and the Overview source. Pure.

export const INBOX_STATUSES = ['idea', 'discussing', 'parked', 'built'] as const;
export type InboxStatus = typeof INBOX_STATUSES[number];

export const INBOX_ORDERS = ['newest', 'oldest', 'az'] as const;
export type InboxOrder = typeof INBOX_ORDERS[number];

export interface InboxItemInfo {
  itemId:   string;
  status:   InboxStatus;
  sentAt:   string | null;   // ISO
  text:     string;          // its first line, for a title
  fullText: string;          // all of it, for search
  taskId:   string | null;
  fromNote: string | null;
}

export interface InboxInfo {
  inboxId: string;
  title:   string;
  items:   InboxItemInfo[];
}

// An inbox somewhere in the notes: which note and tab (null = the main tab) holds it.
export interface InboxRef extends InboxInfo {
  noteId:    string;
  noteTitle: string;
  tabId:     string | null;
}

interface JsonNode {
  type?:    string;
  text?:    string;
  attrs?:   Record<string, unknown>;
  content?: JsonNode[];
}

const textOf = (node: JsonNode, sep = ' '): string =>
  node.text ?? (node.content ?? []).map((c) => textOf(c, sep)).join(node.type === 'paragraph' || node.type === 'heading' ? '' : sep);

const cache = new Map<string, InboxInfo[]>();
const CACHE_LIMIT = 400;

// Every inbox in one stored content JSON string (cached by the string: notes don't change in place).
export function inboxesInContent(json: string): InboxInfo[] {
  if (!json || !json.includes('"inbox"')) return [];
  const hit = cache.get(json);
  if (hit) return hit;
  const out: InboxInfo[] = [];
  const walk = (node: JsonNode) => {
    if (node.type === 'inbox') {
      const title = node.content?.find((c) => c.type === 'inboxTitle');
      out.push({
        inboxId: String(node.attrs?.inboxId ?? ''),
        title:   title ? textOf(title).trim() : '',
        items:   (node.content ?? []).filter((c) => c.type === 'inboxItem').map((item) => {
          const blocks = (item.content ?? []).map((b) => textOf(b).trim()).filter(Boolean);
          const a = item.attrs ?? {};
          return {
            itemId:   String(a.itemId ?? ''),
            status:   (INBOX_STATUSES as readonly string[]).includes(String(a.status)) ? (a.status as InboxStatus) : 'idea',
            sentAt:   typeof a.sentAt === 'string' ? a.sentAt : null,
            text:     blocks[0] ?? '',
            fullText: blocks.join(' '),
            taskId:   typeof a.taskId === 'string' && a.taskId ? a.taskId : null,
            fromNote: typeof a.fromNote === 'string' && a.fromNote ? a.fromNote : null,
          };
        }),
      });
      return;
    }
    node.content?.forEach(walk);
  };
  try { walk(JSON.parse(json)); } catch { return []; }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(json, out);
  return out;
}

// Every inbox in the given notes (views: pass only readable ones), main tab first, then each tab.
export function collectInboxes(notes: Iterable<Note>): InboxRef[] {
  const out: InboxRef[] = [];
  for (const n of notes) {
    if (n.archivedAt) continue;
    const add = (json: string, tabId: string | null) => {
      for (const inbox of inboxesInContent(json)) out.push({ ...inbox, noteId: n.id, noteTitle: n.title, tabId });
    };
    add(n.content, null);
    for (const t of n.tabs) add(t.content, t.id);
  }
  return out;
}

// Where a new item goes among existing ones (an index into the items), by the inbox's order.
export function insertIndex(order: InboxOrder, items: { text: string }[], text: string): number {
  if (order === 'newest') return 0;
  if (order === 'oldest') return items.length;
  const i = items.findIndex((it) => it.text.localeCompare(text, undefined, { sensitivity: 'base' }) > 0);
  return i < 0 ? items.length : i;
}

// The local calendar day of an ISO instant (YYYY-MM-DD).
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

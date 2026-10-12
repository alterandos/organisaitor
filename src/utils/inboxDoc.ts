import { Fragment, type Node as PMNode, type Schema, type Slice } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { insertIndex, type InboxOrder, type InboxStatus } from '@/utils/noteInboxes';

// An inbox's document operations, shared by the block (NoteEditor extensions/Inbox.ts) and the service that sends
// passages to it (services/noteInbox.ts). Pure: positions and transforms only, no stores.
//
//   inbox       inboxId, variant (list / cards / board), order (newest / oldest / az), frames
//   inboxTitle  its name
//   inboxItem   itemId, status, sentAt, fromNote / fromTab (where it was sent from), taskId; holds
//               the passage as ordinary blocks
//   movedStub   the marker a passage leaves where it was (inline): inboxId, itemId, noteId, title

export interface Found { node: PMNode; pos: number }

export function findNode(doc: PMNode, type: string, attr: string, value: string): Found | null {
  let found: Found | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === type && node.attrs[attr] === value) { found = { node, pos }; return false; }
    return !node.isText;
  });
  return found;
}

// An item's first line, for ordering A–Z and for a title.
export const itemText = (item: PMNode): string => {
  let first = '';
  item.forEach((b) => { if (!first) first = b.textContent.trim(); });
  return first;
};

// The position just after an inbox's title, where its first item starts.
export const itemsStart = (inbox: Found) => inbox.pos + 1 + inbox.node.child(0).nodeSize;

// Puts `item` into the inbox at `inboxPos`, where its order says. Returns where it went.
export function insertItem(tr: Transform, inboxPos: number, item: PMNode): number {
  const inbox = tr.doc.nodeAt(inboxPos)!;
  const items: PMNode[] = [];
  inbox.forEach((child, _o, i) => { if (i > 0) items.push(child); });
  const index = insertIndex(inbox.attrs.order as InboxOrder, items.map((it) => ({ text: itemText(it) })), itemText(item));
  let at = itemsStart({ node: inbox, pos: inboxPos });
  for (let i = 0; i < index; i++) at += items[i].nodeSize;
  tr.insert(at, item);
  return at;
}

// The items in the order given: newest / oldest by when they arrived, A–Z by their first line.
export function sortedItems(inbox: PMNode, order: InboxOrder): PMNode[] {
  const items: PMNode[] = [];
  inbox.forEach((child, _o, i) => { if (i > 0) items.push(child); });
  const when = (n: PMNode) => Date.parse(n.attrs.sentAt as string) || 0;
  if (order === 'az') return [...items].sort((a, b) => itemText(a).localeCompare(itemText(b), undefined, { sensitivity: 'base' }));
  return [...items].sort((a, b) => (order === 'newest' ? when(b) - when(a) : when(a) - when(b)));
}

// A selection's content as blocks an item can hold: whole blocks stay as they are, loose text
// becomes a paragraph, a list's items go back into a list, and containers (a section, a column,
// a table row) give up their blocks.
export function sliceToBlocks(slice: Slice, schema: Schema): PMNode[] {
  const { paragraph, bulletList, inboxItem } = schema.nodes;
  const out: PMNode[] = [];
  let inline: PMNode[] = [];
  const flush = () => { if (inline.length) { out.push(paragraph.create(null, inline)); inline = []; } };
  const take = (fragment: Fragment) => {
    fragment.forEach((n) => {
      if (n.isInline) { inline.push(n); return; }
      flush();
      if ((n.type.name === 'listItem' || n.type.name === 'taskItem') && bulletList) out.push(bulletList.create(null, n));
      else if (inboxItem.validContent(Fragment.from(n))) out.push(n);
      else if (n.isTextblock) out.push(paragraph.create(null, n.content));
      else take(n.content);
    });
  };
  take(slice.content);
  flush();
  const blocks = out.filter((b) => b.content.size > 0 || out.length === 1);
  return blocks.length ? blocks : [paragraph.create()];
}

export function newItem(schema: Schema, attrs: { itemId: string; status?: InboxStatus; sentAt: string; fromNote?: string | null; fromTab?: string | null; taskId?: string | null }, blocks?: PMNode[]): PMNode {
  return schema.nodes.inboxItem.create({ status: 'idea', fromNote: null, fromTab: null, taskId: null, ...attrs }, blocks ?? [schema.nodes.paragraph.create()]);
}

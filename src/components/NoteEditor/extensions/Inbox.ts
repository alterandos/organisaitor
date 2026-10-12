import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { liveNoteOf } from '@/services/liveNoteEditor';
import { makeItemTask, noteTitleOf, openInboxItem, openItemSource, taskExists } from '@/services/noteInbox';
import { INBOX_ORDERS, INBOX_STATUSES, type InboxOrder, type InboxStatus } from '@/utils/noteInboxes';
import { insertItem, newItem, sortedItems } from '@/utils/inboxDoc';
import {
  blockFrameAttributes, blockPill, designButtons, frameButtons, openBlockPopover, pillButton, popoverClass as pop,
  replaceTypedWithBlock, selectButton, type BlockDesign,
} from './blockDesigns';

// An inbox in a note (`\inbox`): somewhere to send passages from any note to take further — the
// "dumping ground". Passages arrive through Send to inbox (services/noteInbox.ts), or are typed in.
// Each is an item with a status (Idea → In discussion → Parked → Built), where it came from, and
// optionally a task. Designs: List, Cards, Board (a column per status). The order new items take
// (newest first, oldest first, A–Z) is the inbox's own setting. The document side (finding,
// inserting in order, sorting) is utils/inboxDoc.ts.
//
// Keys, list-like: Enter in the name goes to the first item; Enter on an empty last line of an item
// starts the next item; Enter in an empty item leaves the inbox; Backspace never merges two items.

export const INBOX_VARIANTS = ['list', 'cards', 'board'] as const;
export type InboxVariant = typeof INBOX_VARIANTS[number];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

const str = (key: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${key}`) || null,
  renderHTML: (a: Record<string, unknown>) => {
    const name = key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    return a[name] ? { [`data-${key}`]: a[name] } : {};
  },
});

export const Inbox = Node.create({
  name: 'inbox',
  group: 'block',
  content: 'inboxTitle inboxItem*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      inboxId: str('inbox-id'),
      variant: { default: 'list', parseHTML: (el) => oneOf(INBOX_VARIANTS, el.getAttribute('data-variant'), 'list'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      order:   { default: 'newest', parseHTML: (el) => oneOf(INBOX_ORDERS, el.getAttribute('data-order'), 'newest'), renderHTML: (a) => ({ 'data-order': a.order }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="inbox"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'inbox', 'data-note-block': '' }), 0]; },
});

export const InboxTitle = Node.create({
  name: 'inboxTitle',
  content: 'inline*',
  defining: true,
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-inbox-title]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-inbox-title': '' }), 0]; },
});

export const InboxItem = Node.create({
  name: 'inboxItem',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      itemId:   str('item-id'),
      status:   { default: 'idea', parseHTML: (el) => oneOf(INBOX_STATUSES, el.getAttribute('data-status'), 'idea'), renderHTML: (a) => ({ 'data-status': a.status }) },
      sentAt:   str('sent-at'),
      fromNote: str('from-note'),
      fromTab:  str('from-tab'),
      taskId:   str('task-id'),
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="inbox-item"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'inbox-item' }), 0]; },
});

// What a passage leaves where it was: "↪ Moved to Ideas", which opens it in the inbox, and × to
// remove the marker (the passage stays in the inbox; nothing else refers to the marker).
export const MovedStub = Node.create({
  name: 'movedStub',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { noteId: str('note-id'), inboxId: str('inbox-id'), itemId: str('item-id'), title: str('title') };
  },

  parseHTML() { return [{ tag: 'span[data-type="moved-stub"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'moved-stub' }), `↪ ${LABELS.sendToInbox.stub(String(node.attrs.title ?? ''))}`];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.setAttribute('data-type', 'moved-stub');
      dom.contentEditable = 'false';
      const open = document.createElement('button');
      open.type = 'button';
      open.setAttribute('data-stub-open', '');
      open.title = LABELS.sendToInbox.stubOpen;
      open.textContent = `↪ ${LABELS.sendToInbox.stub(String(node.attrs.title ?? LABELS.noteBlocks.inbox.defaultTitle))}`;
      open.addEventListener('mousedown', (e) => e.preventDefault());
      open.addEventListener('click', (e) => { e.preventDefault(); openInboxItem(String(node.attrs.noteId), String(node.attrs.itemId)); });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('data-stub-remove', '');
      remove.title = LABELS.sendToInbox.stubRemove;
      remove.setAttribute('aria-label', LABELS.sendToInbox.stubRemove);
      remove.textContent = '×';
      remove.addEventListener('mousedown', (e) => e.preventDefault());
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        const p = typeof getPos === 'function' ? getPos() : undefined;
        if (p === undefined || !editor.isEditable) return;
        editor.view.dispatch(editor.state.tr.delete(p, p + 1));
      });
      remove.hidden = !editor.isEditable;
      dom.append(open, remove);
      return { dom, ignoreMutation: () => true, stopEvent: (e: Event) => dom.contains(e.target as globalThis.Node) && e.type !== 'dragstart' };
    };
  },
});

// ── Making and changing ──────────────────────────────────────────────────────

// `\inbox`: replaces from..to (what was typed and the space before it) with an empty inbox, the
// cursor in its name.
export function insertInbox(state: EditorState, from: number, to: number): Transaction | null {
  const { inbox, inboxTitle } = state.schema.nodes;
  if (!inbox) return null;
  const made = replaceTypedWithBlock(state, from, to, inbox.create({ inboxId: nanoid(10) }, [inboxTitle.create()]));
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

export function inboxPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="inbox"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'inbox' ? pos : null;
  } catch { return null; }
}

export function itemPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="inbox-item"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'inboxItem' ? pos : null;
  } catch { return null; }
}

export function setInboxDesign(view: EditorView, pos: number, variant: InboxVariant): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'inbox') return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'variant', variant));
}

// A new order also re-sorts what's there.
export function setInboxOrder(view: EditorView, pos: number, order: InboxOrder): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'inbox') return;
  const start = pos + 1 + node.child(0).nodeSize;
  const tr = view.state.tr.setNodeAttribute(pos, 'order', order);
  tr.replaceWith(start, pos + node.nodeSize - 1, Fragment.from(sortedItems(node, order)));
  view.dispatch(tr);
}

export function setItemStatus(view: EditorView, pos: number, status: InboxStatus): void {
  if (view.state.doc.nodeAt(pos)?.type.name !== 'inboxItem') return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, 'status', status));
}

export function deleteItem(view: EditorView, pos: number): void {
  const item = view.state.doc.nodeAt(pos);
  if (item?.type.name !== 'inboxItem') return;
  const tr = view.state.tr.delete(pos, pos + item.nodeSize);
  view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1)));
  view.focus();
}

// A new, empty item typed into the inbox (where its order puts it), the cursor in it.
export function addItem(view: EditorView, inboxPos: number): void {
  const tr = view.state.tr;
  const at = insertItem(tr, inboxPos, newItem(view.state.schema, { itemId: nanoid(10), sentAt: new Date().toISOString() }));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  view.focus();
}

// ── Keys ─────────────────────────────────────────────────────────────────────

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

interface Where { inbox: PMNode; inboxPos: number; item: PMNode | null; itemPos: number; childIndex: number }

// The inbox (and item) the cursor is in, when the cursor's textblock is the title or a direct child
// of an item. Deeper (inside a list in an item) the list's own keys apply.
function where(state: EditorState): Where | null {
  const { $from } = state.selection;
  const d = $from.depth;
  if (d < 2) return null;
  const parent = $from.node(d - 1);
  if (parent.type.name === 'inbox' && $from.parent.type.name === 'inboxTitle') {
    return { inbox: parent, inboxPos: $from.before(d - 1), item: null, itemPos: -1, childIndex: 0 };
  }
  if (parent.type.name === 'inboxItem' && d >= 3 && $from.node(d - 2).type.name === 'inbox') {
    return { inbox: $from.node(d - 2), inboxPos: $from.before(d - 2), item: parent, itemPos: $from.before(d - 1), childIndex: $from.index(d - 1) };
  }
  return null;
}

const isEmpty = (n: PMNode) => n.textContent.trim() === '' && !n.firstChild?.isAtom;

function leaveAfter(state: EditorState, tr: Transaction, end: number): Transaction {
  const $end = tr.doc.resolve(end);
  const after = Selection.findFrom($end, 1, true);
  if (after && after.from <= end + 2) return tr.setSelection(after);
  tr.insert(end, state.schema.nodes.paragraph.create());
  return tr.setSelection(TextSelection.create(tr.doc, end + 1));
}

export const inboxEnter: Command = (state, dispatch) => {
  const w = where(state);
  if (!w || !state.selection.empty) return false;
  if (!w.item) {
    if (!dispatch) return true;
    const start = w.inboxPos + 1 + w.inbox.child(0).nodeSize;
    if (w.inbox.childCount > 1) { dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(start + 1))).scrollIntoView()); return true; }
    const tr = state.tr.insert(start, newItem(state.schema, { itemId: nanoid(10), sentAt: new Date().toISOString() }));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 2)).scrollIntoView());
    return true;
  }
  const line = state.selection.$from.parent;
  const lastLine = w.childIndex === w.item.childCount - 1;
  if (!lastLine || line.content.size > 0) return false;
  if (!dispatch) return true;
  if (isEmpty(w.item)) {
    // An empty item: it goes, and the cursor leaves the inbox.
    const tr = state.tr.delete(w.itemPos, w.itemPos + w.item.nodeSize);
    dispatch(leaveAfter(state, tr, w.inboxPos + w.inbox.nodeSize - w.item.nodeSize).scrollIntoView());
    return true;
  }
  // The empty last line becomes the next item.
  const linePos = state.selection.$from.before();
  const tr = state.tr.delete(linePos, linePos + line.nodeSize);
  const at = w.itemPos + w.item.nodeSize - line.nodeSize;
  tr.insert(at, newItem(state.schema, { itemId: nanoid(10), sentAt: new Date().toISOString() }));
  dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  return true;
};

export const inboxBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const w = where(state);
  if (!w) return false;
  if (!w.item) {
    // In the name: an inbox with nothing in it at all turns back into a line.
    if (w.inbox.childCount === 1 && w.inbox.textContent === '' && dispatch) {
      const tr = state.tr.replaceWith(w.inboxPos, w.inboxPos + w.inbox.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, w.inboxPos + 1)));
    }
    return true;
  }
  if (w.childIndex > 0) return false;
  if (!dispatch) return true;
  const back = Selection.near(state.doc.resolve(w.itemPos), -1);
  if (isEmpty(w.item)) {
    const tr = state.tr.delete(w.itemPos, w.itemPos + w.item.nodeSize);
    dispatch(tr.setSelection(Selection.near(tr.doc.resolve(w.itemPos), -1)).scrollIntoView());
    return true;
  }
  dispatch(state.tr.setSelection(back).scrollIntoView());
  return true;
};

// Delete at the end of an item's last line would pull the next item in: it stops there.
export const inboxDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  const w = where(state);
  if (!w) return false;
  return w.item ? w.childIndex === w.item.childCount - 1 : true;
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<InboxVariant, string> = {
  list:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 6.5h9M2 10h12M2 13.5h8"/></svg>',
  cards: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="5" rx="1.3"/><rect x="2" y="9" width="12" height="5" rx="1.3"/></svg>',
  board: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="3.6" height="12" rx="1"/><rect x="6.2" y="2" width="3.6" height="8" rx="1"/><rect x="10.9" y="2" width="3.6" height="10" rx="1"/></svg>',
};

export const INBOX_DESIGNS: BlockDesign<InboxVariant>[] = INBOX_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.inbox.designs[id], icon: DESIGN_ICONS[id] }));

const STATUS_ICON: Record<InboxStatus, string> = { idea: '💡', discussing: '💬', parked: '⏸', built: '✅' };

function toolsWidget(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.inbox;
  const bar = blockPill('data-inbox-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const order = attrs.order as InboxOrder;
  const next = INBOX_ORDERS[(INBOX_ORDERS.indexOf(order) + 1) % INBOX_ORDERS.length];
  const orderBtn = pillButton(L.orderTitle(L.order[order]), () => { const p = pos(); if (p !== null) setInboxOrder(view, p, next); }, L.order[order]);
  orderBtn.setAttribute('data-inbox-tool', 'order');
  bar.append(
    designButtons(INBOX_DESIGNS, attrs.variant as InboxVariant, (v) => { const p = pos(); if (p !== null) setInboxDesign(view, p, v); }),
    orderBtn, frameButtons(view, getPos, attrs), selectButton(view, getPos),
  );
  return bar;
}

const chip = (attr: string, text: string, title: string, onClick: (e: MouseEvent) => void) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute(attr, '');
  b.textContent = text;
  b.title = title;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return b;
};

export function openStatusPicker(view: EditorView, itemPos: number, anchor: DOMRect): void {
  const item = view.state.doc.nodeAt(itemPos);
  if (item?.type.name !== 'inboxItem') return;
  const L = LABELS.noteBlocks.inbox;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const h = document.createElement('div');
    h.className = pop.heading;
    h.textContent = L.status;
    const row = document.createElement('div');
    row.className = pop.row;
    for (const s of INBOX_STATUSES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = pop.choice;
      b.textContent = `${STATUS_ICON[s]} ${L.statuses[s]}`;
      b.setAttribute('aria-pressed', String(item.attrs.status === s));
      b.addEventListener('click', () => { setItemStatus(view, itemPos, s); close(); view.focus(); });
      row.append(b);
    }
    box.append(h, row);
    return box;
  });
}

// The line above an item's text: its status, where it came from, its task, and ⋯.
function itemChrome(view: EditorView, getPos: () => number | undefined, attrs: Record<string, unknown>): HTMLElement {
  const L = LABELS.noteBlocks.inbox;
  const bar = document.createElement('div');
  bar.contentEditable = 'false';
  bar.setAttribute('data-inbox-chrome', '');
  const itemPos = () => { const p = getPos(); return p === undefined ? null : p - 1; };
  const status = attrs.status as InboxStatus;
  bar.append(chip('data-inbox-status', `${STATUS_ICON[status]} ${L.statuses[status]}`, L.statusTitle, (e) => {
    const p = itemPos();
    if (p !== null && view.editable) openStatusPicker(view, p, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }));
  const fromNote = attrs.fromNote as string | null;
  if (fromNote) {
    const here = liveNoteOf(view)?.noteId === fromNote;
    const title = here ? null : noteTitleOf(fromNote);
    bar.append(chip('data-inbox-from', here ? L.fromHere : L.from(title ?? '…'), L.fromTitle, () => openItemSource(fromNote, String(attrs.itemId))));
  }
  const taskId = attrs.taskId as string | null;
  if (taskId && taskExists(taskId)) {
    bar.append(chip('data-inbox-task', `✔ ${L.task}`, L.openTask, () => { const p = itemPos(); if (p !== null) makeItemTask(view, p); }));
  }
  bar.append(chip('data-inbox-more', '⋯', L.itemMenu, (e) => {
    const p = itemPos();
    if (p !== null) openItemMenu(view, p, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }));
  return bar;
}

// ⋯ on an item (the same choices as its right-click menu, for touch): make a task, go to where it
// came from, delete it.
function openItemMenu(view: EditorView, itemPos: number, anchor: DOMRect): void {
  const item = view.state.doc.nodeAt(itemPos);
  if (item?.type.name !== 'inboxItem') return;
  const L = LABELS.noteBlocks.inbox;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    box.className = pop.row;
    box.setAttribute('data-inbox-menu', '');
    const action = (label: string, run: () => void, danger = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `${pop.choice}${danger ? ` ${pop.danger}` : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => { close(); run(); });
      box.append(b);
    };
    const hasTask = taskExists(item.attrs.taskId as string | null);
    if (view.editable || hasTask) action(hasTask ? L.openTask : L.makeTask, () => makeItemTask(view, itemPos));
    if (item.attrs.fromNote) action(L.fromTitle, () => openItemSource(item.attrs.fromNote as string, String(item.attrs.itemId)));
    if (view.editable) action(L.deleteItem, () => deleteItem(view, itemPos), true);
    return box;
  });
}

function emptyWidget(): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'false';
  el.setAttribute('data-inbox-empty', '');
  el.textContent = LABELS.noteBlocks.inbox.empty;
  return el;
}

function columnsWidget(): HTMLElement {
  const frag = document.createElement('div');
  frag.contentEditable = 'false';
  frag.setAttribute('data-inbox-columns', '');
  for (const s of INBOX_STATUSES) {
    const h = document.createElement('div');
    h.setAttribute('data-inbox-column', s);
    h.textContent = `${STATUS_ICON[s]} ${LABELS.noteBlocks.inbox.statuses[s]}`;
    frag.append(h);
  }
  return frag;
}

function addWidget(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-inbox-add', '');
  b.textContent = `+ ${LABELS.noteBlocks.inbox.add}`;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const p = getPos();
    if (p === undefined || !view.editable) return;
    const inboxPos = view.state.doc.resolve(p).before();
    addItem(view, inboxPos);
  });
  return b;
}

function inboxDecorations(state: EditorState): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.inbox;
  const current = where(state);
  let k = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'inbox') return !node.isTextblock;
    const i = k++;
    const editing = current?.inboxPos === pos;
    const items = node.childCount - 1;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { ...(editing ? { 'data-inbox-current': '' } : {}), ...(items === 0 ? { 'data-inbox-none': '' } : {}) }));
    const a = node.attrs;
    const key = `${a.variant}-${a.order}-${a.outlined ? 'o' : ''}${a.shaded ? 's' : ''}-${a.outlineColor}-${a.shadeColor}-${a.frameShape}-${a.outlineStyle}-${a.outlineWidth}`;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, a), { side: -1, key: `inbox-tools-${i}-${key}`, ignoreSelection: true, stopEvent: () => true }));
    const title = node.child(0);
    const afterTitle = pos + 1 + title.nodeSize;
    if (title.content.size === 0) decos.push(Decoration.node(pos + 1, afterTitle, { 'data-inbox-placeholder': L.titlePlaceholder }));
    if (a.variant === 'board') decos.push(Decoration.widget(afterTitle, () => columnsWidget(), { side: -1, key: `inbox-columns-${i}`, ignoreSelection: true }));
    if (items === 0) decos.push(Decoration.widget(afterTitle, () => emptyWidget(), { side: 1, key: `inbox-empty-${i}`, ignoreSelection: true }));
    node.forEach((item, offset, index) => {
      if (index === 0) return;
      const ip = pos + 1 + offset;
      const ia = item.attrs;
      decos.push(Decoration.widget(ip + 1, (view, getPos) => itemChrome(view, getPos, ia),
        { side: -1, key: `inbox-chrome-${ia.itemId}-${ia.status}-${ia.taskId}-${ia.fromNote}`, ignoreSelection: true, stopEvent: () => true }));
      if (item.childCount === 1 && item.firstChild!.isTextblock && item.firstChild!.content.size === 0) {
        decos.push(Decoration.node(ip + 1, ip + 1 + item.firstChild!.nodeSize, { 'data-inbox-placeholder': L.itemPlaceholder }));
      }
    });
    decos.push(Decoration.widget(pos + node.nodeSize - 1, (view, getPos) => addWidget(view, getPos), { side: 1, key: `inbox-add-${i}`, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return k ? DecorationSet.create(state.doc, decos) : null;
}

// Every inbox and item has an id (stubs and Overview find them by it), and ids are unique within a
// note: one pasted in again, or copied from another inbox, gets a new one.
function fixIds(state: EditorState): Transaction | null {
  const seen = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    const key = node.type.name === 'inbox' ? 'inboxId' : node.type.name === 'inboxItem' ? 'itemId' : null;
    if (key) {
      const id = node.attrs[key] as string | null;
      if (!id || seen.has(`${key}:${id}`)) {
        const fresh = nanoid(10);
        tr ??= state.tr;
        tr.setNodeAttribute(pos, key, fresh);
        seen.add(`${key}:${fresh}`);
        if (node.type.name === 'inboxItem' && !node.attrs.sentAt) tr.setNodeAttribute(pos, 'sentAt', new Date().toISOString());
      } else seen.add(`${key}:${id}`);
    }
    return !node.isTextblock;
  });
  return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
}

const inboxKey = new PluginKey('inbox');

// Keys, drawing and ids, separate from the nodes so the priority doesn't move them up the schema
// (see TimelineBehaviour).
export const InboxBehaviour = Extension.create({
  name: 'inboxBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return { Enter: run(inboxEnter), Backspace: run(inboxBackspace), Delete: run(inboxDelete) };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: inboxKey,
      props: { decorations: inboxDecorations },
      appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? fixIds(state) : null),
    })];
  },
});

export const InboxExtensions = [Inbox, InboxTitle, InboxItem, MovedStub, InboxBehaviour];


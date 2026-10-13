import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { QUESTION_STATUS_ICON } from '@/config/itemIcons';
import { useCalendarStore } from '@/store/calendarStore';
import { buildCalendarReminderInput } from '@/utils/calendarItemInput';
import { questionSubject, type QuestionStatus } from '@/utils/noteQuestions';
import { formatDate } from '@/utils/date';
import { GLOSSARY_TYPES } from '@/config/structuredTagTypes';
import { useNoteStore } from '@/store/noteStore';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import type { StructuredTagEntryId } from '@/types';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import type { NoteObjectContext } from '../objects/types';
import { blockFrameAttributes, blockPill, designButtons, frameButtons, openBlockPopover, pillButton, replaceTypedWithBlock, selectButton, type BlockDesign } from './blockDesigns';
import { newGlossaryRecord } from './GlossaryCard';

// A question in a note (`\question`): something not known yet, noted now to answer later. Agreed
// with the user 2026-10-13. Note-taking structure, like the quote (extensions/Quote.ts):
//
//   questionBlock  attrs: qid (stable id, for the Overview's Questions and finding it), status
//                  (open / answered / dropped), answeredAt, followUp (a date) and reminderId (its
//                  calendar reminder, if one was made), entryId (the Glossary card that answered
//                  it), variant (design), hidden (what a hidden part held), frames
//   questionText   the question
//   questionField  an optional part (field attr): why it matters, a lead (any number), the answer;
//                  only the parts being used are in the document, in QUESTION_FIELDS order
//
// "Answer with a card" makes a Definition, Concept or Acronym from the question (its subject as
// the term, the answer as the meaning), puts the card after it and marks it answered: the
// question stays, so the trail of what wasn't known, and when it was learned, isn't lost.
// Keys as in the quote: Enter moves on through the parts (a new lead after a lead; leaving after
// the last), Tab / Shift+Tab move between parts, Backspace at the start of a part steps back.

export const QUESTION_VARIANTS = ['card', 'compact'] as const;
export type QuestionVariant = typeof QUESTION_VARIANTS[number];
export const QUESTION_FIELDS = ['why', 'lead', 'answer'] as const;
export type QuestionField = typeof QUESTION_FIELDS[number];
export const QUESTION_STATUSES: QuestionStatus[] = ['open', 'answered', 'dropped'];

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
const str = (name: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) || null,
  renderHTML: (a: Record<string, unknown>) => (a[toAttr(name)] ? { [`data-${name}`]: a[toAttr(name)] } : {}),
});
const toAttr = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export const QuestionBlock = Node.create({
  name: 'questionBlock',
  group: 'block',
  content: 'questionText questionField*',
  defining: true,

  addAttributes() {
    return {
      ...blockFrameAttributes(),
      qid:        { default: null, parseHTML: (el) => el.getAttribute('data-qid'), renderHTML: (a) => (a.qid ? { 'data-qid': a.qid } : {}) },
      status:     { default: 'open', parseHTML: (el) => oneOf(QUESTION_STATUSES, el.getAttribute('data-status'), 'open'), renderHTML: (a) => ({ 'data-status': a.status }) },
      answeredAt: str('answered-at'),
      followUp:   str('follow-up'),
      reminderId: str('reminder-id'),
      entryId:    str('entry-id'),
      // Note (renamed 2026-10-13, at the user's request) reads as Compact.
      variant:    { default: 'card', parseHTML: (el) => oneOf(QUESTION_VARIANTS, el.getAttribute('data-variant') === 'note' ? 'compact' : el.getAttribute('data-variant'), 'card'), renderHTML: (a) => ({ 'data-variant': a.variant }) },
      hidden: {
        default: {},
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-hidden') || '{}'); } catch { return {}; } },
        renderHTML: (a) => (Object.keys(a.hidden ?? {}).length ? { 'data-hidden': JSON.stringify(a.hidden) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="question"]' }]; },
  // The Card design's kind line ("Question · Answered") and the Compact design's icon, drawn by CSS
  // from these, the way a Glossary card shows its kind (the same family of look).
  renderHTML({ node, HTMLAttributes }) {
    const status = node.attrs.status as QuestionStatus;
    const L = LABELS.noteBlocks.question;
    // A question is drawn as a card, with its own border: no Outline (CARD_BLOCK_NODES).
    const { 'data-outlined': _outlined, ...attrs } = HTMLAttributes as Record<string, unknown>;
    void _outlined;
    return ['div', mergeAttributes(attrs, {
      'data-type': 'question', 'data-note-block': '',
      'data-qn-heading': status === 'open' ? L.label : `${L.label} · ${L.statuses[status]}`,
      'data-qn-icon': QUESTION_STATUS_ICON[status],
    }), 0];
  },
});

export const QuestionText = Node.create({
  name: 'questionText',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-qn-text]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-qn-text': '' }), 0]; },
});

export const QuestionFieldNode = Node.create({
  name: 'questionField',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { field: { default: 'why', parseHTML: (el) => oneOf(QUESTION_FIELDS, el.getAttribute('data-qn-field'), 'why'), renderHTML: (a) => ({ 'data-qn-field': a.field }) } };
  },
  parseHTML() { return [{ tag: 'div[data-qn-field]', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['div', HTMLAttributes, 0]; },
});

// ── Positions ────────────────────────────────────────────────────────────────

interface QuestionAt { q: PMNode; pos: number; partIndex: number }

function questionAt($pos: ResolvedPos): QuestionAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'questionBlock') continue;
    return { q: $pos.node(d), pos: $pos.before(d), partIndex: d < $pos.depth ? $pos.index(d) : 0 };
  }
  return null;
}

const partStart = (at: QuestionAt, index: number) => {
  let p = at.pos + 1;
  for (let i = 0; i < index; i++) p += at.q.child(i).nodeSize;
  return p;
};

const fieldsOf = (q: PMNode): QuestionField[] => {
  const out: QuestionField[] = [];
  q.forEach((child, _o, i) => { if (i > 0) out.push(child.attrs.field as QuestionField); });
  return out;
};

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// ── Making one ───────────────────────────────────────────────────────────────

// `\question`: replaces what was typed with an empty question, the cursor in it.
export function insertQuestion(state: EditorState, from: number, to: number): Transaction | null {
  const { questionBlock, questionText } = state.schema.nodes;
  if (!questionBlock) return null;
  const made = replaceTypedWithBlock(state, from, to, questionBlock.create({ qid: nanoid(10) }, [questionText.create()]));
  if (!made) return null;
  return made.tr.setSelection(TextSelection.create(made.tr.doc, made.at + 2)).scrollIntoView();
}

// ── Changing one ─────────────────────────────────────────────────────────────

const questionNodeAt = (state: EditorState, pos: number) => {
  const n = state.doc.nodeAt(pos);
  return n?.type.name === 'questionBlock' ? n : null;
};

export function setQuestionAttrs(view: EditorView, pos: number, attrs: Record<string, unknown>): void {
  const q = questionNodeAt(view.state, pos);
  if (q) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...q.attrs, ...attrs }));
}

// Answered sets when; a question answered gets its Answer part if it hasn't one.
export function setQuestionStatus(view: EditorView, pos: number, status: QuestionStatus): void {
  const q = questionNodeAt(view.state, pos);
  if (!q) return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...q.attrs, status, answeredAt: status === 'answered' ? (q.attrs.answeredAt ?? new Date().toISOString()) : null });
  if (status === 'answered' && !fieldsOf(q).includes('answer')) tr.insert(pos + q.nodeSize - 1, view.state.schema.nodes.questionField.create({ field: 'answer' }));
  view.dispatch(tr);
}

// Shows Why or Answer (bringing back what it held), hides it (keeping its text), or adds a lead.
export function toggleQuestionField(view: EditorView, pos: number, field: QuestionField): void {
  const state = view.state;
  const q = questionNodeAt(state, pos);
  if (!q) return;
  const hidden = { ...(q.attrs.hidden as Record<string, string>) };
  const tr = state.tr;
  const order = QUESTION_FIELDS.indexOf(field);
  let insertAt = pos + 1 + q.child(0).nodeSize;
  let shownAt = -1;
  q.forEach((child, offset, i) => {
    if (i === 0) return;
    const f = child.attrs.field as QuestionField;
    if (f === field && field !== 'lead') shownAt = pos + 1 + offset;
    if (QUESTION_FIELDS.indexOf(f) <= order) insertAt = pos + 1 + offset + child.nodeSize;
  });
  if (shownAt >= 0) {
    const child = state.doc.nodeAt(shownAt)!;
    if (child.textContent) hidden[field] = child.textContent;
    tr.delete(shownAt, shownAt + child.nodeSize);
  } else {
    const text = field === 'lead' ? '' : hidden[field];
    delete hidden[field];
    tr.insert(insertAt, state.schema.nodes.questionField.create({ field }, text ? state.schema.text(text) : null));
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
  }
  tr.setNodeAttribute(pos, 'hidden', hidden);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// Follow up by a date: set on the question, and — asked first — a reminder in the calendar,
// linked back to the note. Clearing it doesn't touch a reminder already made.
export async function setQuestionFollowUp(view: EditorView, pos: number, date: string | null, ctx: NoteObjectContext | null): Promise<void> {
  const q = questionNodeAt(view.state, pos);
  if (!q) return;
  setQuestionAttrs(view, pos, { followUp: date });
  if (!date) return;
  const L = LABELS.noteBlocks.question;
  const ok = await confirmDialog({ title: L.reminderTitle, message: L.reminderMessage(formatDate(date)), confirmLabel: L.reminderConfirm });
  if (!ok) return;
  const text = q.child(0).textContent.trim() || L.label;
  const reminderId = useCalendarStore.getState().addReminder(buildCalendarReminderInput({
    title: L.reminderName(text), date, collectionId: ctx?.collectionId ?? null,
    crossAppRefs: ctx ? [{ type: 'note', id: ctx.noteId, ...(ctx.tabId ? { tabId: ctx.tabId } : {}) }] : [],
  }));
  const at = view.state.doc.nodeAt(pos)?.type.name === 'questionBlock' ? pos : null;
  if (at !== null) setQuestionAttrs(view, at, { reminderId });
}

// Answer with a card: a Glossary record from the question (its subject as the term, the answer as
// what it means), its card after the question, and the question marked answered by it.
export function answerWithCard(view: EditorView, pos: number, typeKey: string, ctx: NoteObjectContext | null): void {
  const state = view.state;
  const q = questionNodeAt(state, pos);
  const card = state.schema.nodes.glossaryCard;
  if (!q || !card || !ctx) return;
  const entryId = newGlossaryRecord(typeKey, ctx);
  if (!entryId) return;
  let answer = '';
  q.forEach((child, _o, i) => { if (i > 0 && child.attrs.field === 'answer') answer = child.textContent.trim(); });
  useNoteStore.getState().updateStructuredTagEntry(entryId as StructuredTagEntryId, {
    term: questionSubject(q.child(0).textContent),
    fields: answer ? { [GLOSSARY_TYPES[typeKey]]: answer } : {},
  });
  const after = pos + q.nodeSize;
  const tr = state.tr.insert(after, card.create({ entryId }));
  tr.setNodeMarkup(pos, undefined, { ...q.attrs, status: 'answered', answeredAt: q.attrs.answeredAt ?? new Date().toISOString(), entryId });
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, after)).scrollIntoView());
  view.focus();
}

export function questionPosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="question"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0) - 1;
    return view.state.doc.nodeAt(pos)?.type.name === 'questionBlock' ? pos : null;
  } catch { return null; }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

function toPart(state: EditorState, at: QuestionAt, index: number, dispatch?: (tr: Transaction) => void): boolean {
  if (dispatch) {
    const start = partStart(at, index);
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, start + 1 + at.q.child(index).content.size)).scrollIntoView());
  }
  return true;
}

function leave(state: EditorState, at: QuestionAt, dispatch?: (tr: Transaction) => void): boolean {
  if (!dispatch) return true;
  const after = at.pos + at.q.nodeSize;
  const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  return true;
}

export const questionEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const at = questionAt($from);
  if (!at || !$from.parent.isTextblock) return false;
  const part = at.q.child(at.partIndex);
  // An empty question: back to a plain line.
  if (at.partIndex === 0 && at.q.textContent.trim() === '') {
    if (dispatch) {
      const tr = state.tr.replaceWith(at.pos, at.pos + at.q.nodeSize, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at.pos + 1)));
    }
    return true;
  }
  // In a lead with text: another lead after it. An empty lead: it goes, and the cursor moves on.
  if (at.partIndex > 0 && part.attrs.field === 'lead') {
    const start = partStart(at, at.partIndex);
    if (part.content.size > 0) {
      if (dispatch) {
        const after = start + part.nodeSize;
        const tr = state.tr.insert(after, state.schema.nodes.questionField.create({ field: 'lead' }));
        dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
      }
      return true;
    }
    if (dispatch) {
      const tr = state.tr.delete(start, start + part.nodeSize);
      const q = tr.doc.nodeAt(at.pos)!;
      if (at.partIndex < q.childCount) {
        tr.setSelection(TextSelection.create(tr.doc, start + 1 + q.child(at.partIndex).content.size));
      } else {
        const after = at.pos + q.nodeSize;
        tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  if (at.partIndex + 1 < at.q.childCount) return toPart(state, at, at.partIndex + 1, dispatch);
  return leave(state, at, dispatch);
};

export const questionTab = (dir: 1 | -1): Command => (state, dispatch) => {
  const at = questionAt(state.selection.$from);
  if (!at) return false;
  const next = at.partIndex + dir;
  if (next < 0 || next >= at.q.childCount) return true;
  return toPart(state, at, next, dispatch);
};

export const questionBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const at = questionAt($from);
  if (!at) return false;
  if (at.partIndex === 0) return true;
  // An empty lead goes; anything else steps back to the part before.
  const part = at.q.child(at.partIndex);
  if (part.attrs.field === 'lead' && part.content.size === 0 && dispatch) {
    const start = partStart(at, at.partIndex);
    const tr = state.tr.delete(start, start + part.nodeSize);
    const prevEnd = start - 1;
    dispatch(tr.setSelection(TextSelection.create(tr.doc, prevEnd)));
    return true;
  }
  return toPart(state, at, at.partIndex - 1, dispatch);
};

export const questionDelete: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
  return !!questionAt($from);
};

// ── Drawing ──────────────────────────────────────────────────────────────────

const DESIGN_ICONS: Record<QuestionVariant, string> = {
  card: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5M8 11.2v.1"/></svg>',
  compact: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.3"/><path d="M5.5 8h2.5M10 5v6M12 8h2.5"/></svg>',
};
export const QUESTION_DESIGNS: BlockDesign<QuestionVariant>[] = QUESTION_VARIANTS.map((id) => ({ id, label: LABELS.noteBlocks.question.designs[id], icon: DESIGN_ICONS[id] }));

const statusChoices = (current: QuestionStatus, pick: (s: QuestionStatus) => void): HTMLElement => {
  const L = LABELS.noteBlocks.question;
  const wrap = document.createElement('span');
  wrap.setAttribute('data-qn-statuses', '');
  for (const s of QUESTION_STATUSES) {
    const b = pillButton(L.setStatus(L.statuses[s]), () => pick(s), L.statuses[s]);
    b.setAttribute('data-qn-tool', 'status');
    b.setAttribute('data-qn-status-choice', s);
    b.setAttribute('aria-pressed', String(s === current));
    wrap.append(b);
  }
  return wrap;
};

// A date picker popover for "Follow up by".
export function openFollowUpPicker(view: EditorView, pos: number, anchor: DOMRect, current: string | null, ctx: () => NoteObjectContext | null): void {
  const L = LABELS.noteBlocks.question;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    box.setAttribute('data-qn-followup', '');
    const input = document.createElement('input');
    input.type = 'date';
    input.value = current ?? '';
    input.setAttribute('aria-label', L.followUp);
    const set = document.createElement('button');
    set.type = 'button';
    set.textContent = L.followUpSet;
    set.addEventListener('click', () => { close(); if (input.value) void setQuestionFollowUp(view, pos, input.value, ctx()); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); set.click(); } });
    box.append(input, set);
    if (current) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = L.followUpClear;
      clear.addEventListener('click', () => { close(); void setQuestionFollowUp(view, pos, null, ctx()); });
      box.append(clear);
    }
    setTimeout(() => input.focus(), 0);
    return box;
  });
}

// "Answer with a card": the three kinds of card to choose from.
export function openAnswerPicker(view: EditorView, pos: number, anchor: DOMRect, ctx: () => NoteObjectContext | null): void {
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    box.setAttribute('data-qn-answer-kinds', '');
    for (const typeKey of Object.keys(GLOSSARY_TYPES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = LABELS.noteBlocks[typeKey as 'definition' | 'acronym' | 'concept'].label;
      b.addEventListener('click', () => { close(); answerWithCard(view, pos, typeKey, ctx()); });
      box.append(b);
    }
    return box;
  });
}

function toolsWidget(view: EditorView, getPos: () => number | undefined, node: PMNode, ctx: () => NoteObjectContext | null): HTMLElement {
  const L = LABELS.noteBlocks.question;
  const bar = blockPill('data-question-tools');
  const pos = () => { const p = getPos(); return p === undefined || !view.editable ? null : p - 1; };
  const a = node.attrs;
  const shown = fieldsOf(node);
  const fields = document.createElement('span');
  fields.setAttribute('data-qn-fields', '');
  for (const f of QUESTION_FIELDS) {
    const on = f !== 'lead' && shown.includes(f);
    const b = pillButton(on ? L.hideField(L.fields[f]) : L.addField(L.fields[f]), () => { const p = pos(); if (p !== null) toggleQuestionField(view, p, f); }, `${on ? '−' : '+'} ${L.fields[f]}`);
    b.setAttribute('data-qn-tool', 'field');
    b.setAttribute('aria-pressed', String(on));
    fields.append(b);
  }
  const follow = pillButton(L.followUp, (e) => { const p = pos(); if (p !== null) openFollowUpPicker(view, p, (e.currentTarget as HTMLElement).getBoundingClientRect(), a.followUp as string | null, ctx); },
    a.followUp ? L.followUpOn(formatDate(a.followUp as string)) : L.followUpShort);
  follow.setAttribute('data-qn-tool', 'follow-up');
  const answer = pillButton(L.answerWithCard, (e) => { const p = pos(); if (p !== null) openAnswerPicker(view, p, (e.currentTarget as HTMLElement).getBoundingClientRect(), ctx); }, L.answerWithCardShort);
  answer.setAttribute('data-qn-tool', 'answer-card');
  bar.append(
    designButtons(QUESTION_DESIGNS, a.variant as QuestionVariant, (v) => { const p = pos(); if (p !== null) setQuestionAttrs(view, p, { variant: v }); }),
    statusChoices(a.status as QuestionStatus, (s) => { const p = pos(); if (p !== null) setQuestionStatus(view, p, s); }),
    fields, follow, answer,
    frameButtons(view, getPos, a), selectButton(view, getPos),
  );
  return bar;
}

// Under an answered question: the card that answered it, as a link to it.
function answeredByWidget(entryId: string): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'false';
  el.setAttribute('data-qn-answered-by', '');
  const raw = useNoteStore.getState().structuredTagEntries[entryId as StructuredTagEntryId];
  const label = document.createElement('span');
  label.textContent = `${LABELS.noteBlocks.question.answeredBy} `;
  const link = document.createElement('button');
  link.type = 'button';
  link.textContent = raw?.term || '…';
  link.addEventListener('mousedown', (e) => e.preventDefault());
  link.addEventListener('click', () => { if (raw) openNotePassage(raw.noteId, definitionPassage(entryId)); });
  el.append(label, link);
  return el;
}

function questionDecorations(state: EditorState, ctx: () => NoteObjectContext | null): DecorationSet | null {
  const decos: Decoration[] = [];
  const L = LABELS.noteBlocks.question;
  const current = questionAt(state.selection.$from);
  let n = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'questionBlock') return !node.isTextblock;
    const t = n++;
    const editing = current?.pos === pos;
    const a = node.attrs;
    decos.push(Decoration.widget(pos + 1, (view, getPos) => toolsWidget(view, getPos, node, ctx), {
      side: -1, ignoreSelection: true, stopEvent: () => true,
      key: `qn-tools-${t}-${a.variant}-${a.status}-${a.followUp ?? ''}-${fieldsOf(node).join(',')}-${a.outlined ? 'o' : ''}${a.shaded ? 's' : ''}`,
    }));
    if (editing) decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-qn-current': '' }));
    let childPos = pos + 1;
    node.forEach((child, _o, i) => {
      const end = childPos + child.nodeSize;
      const empty = child.content.size === 0;
      if (i === 0) {
        if (empty) decos.push(Decoration.node(childPos, end, { 'data-qn-empty': '', 'data-qn-placeholder': L.textPlaceholder }));
      } else {
        const field = child.attrs.field as QuestionField;
        const attrs: Record<string, string> = { 'data-qn-label': L.fields[field] };
        if (empty) { attrs['data-qn-empty'] = ''; attrs['data-qn-placeholder'] = L.fieldPlaceholders[field]; }
        decos.push(Decoration.node(childPos, end, attrs));
      }
      childPos = end;
    });
    if (a.entryId) decos.push(Decoration.widget(pos + node.nodeSize - 1, () => answeredByWidget(a.entryId as string), { side: 1, key: `qn-answered-${a.entryId}`, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return n ? DecorationSet.create(state.doc, decos) : null;
}

const questionKey = new PluginKey('questionBlock');

// ── Answered by writing an answer ────────────────────────────────────────────
// An open question whose answer was empty when the cursor went in, and has words when it leaves,
// becomes Answered (asked for by the user 2026-10-13). On leaving, not while typing, so the status
// doesn't change under the cursor; as its own undo step, so Ctrl+Z puts it back to Open without
// touching the answer; the status pill changes it back too. An answer that was already there when
// the cursor went in never re-answers a question set back to Open.

interface AnswerVisit { qid: string | null; emptyAtEntry: boolean }

// The answer part the cursor is in: its question's id and text.
function answerAt(state: EditorState): { qid: string; text: string } | null {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'questionField') {
      const q = $from.node(d - 1);
      return node.attrs.field === 'answer' && q.type.name === 'questionBlock' && q.attrs.qid ? { qid: q.attrs.qid as string, text: node.textContent.trim() } : null;
    }
  }
  return null;
}

function questionByQid(doc: PMNode, qid: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'questionBlock' && node.attrs.qid === qid) { found = { node, pos }; return false; }
    return true;
  });
  return found;
}

const answerOf = (q: PMNode) => { let t = ''; q.forEach((c, _o, i) => { if (i > 0 && c.attrs.field === 'answer') t = c.textContent.trim(); }); return t; };

const answeredKey = new PluginKey<AnswerVisit>('questionAnswered');

export function answeredOnLeavePlugin(): Plugin<AnswerVisit> {
  return new Plugin<AnswerVisit>({
    key: answeredKey,
    state: {
      init: (_c, state) => { const a = answerAt(state); return { qid: a?.qid ?? null, emptyAtEntry: !!a && !a.text }; },
      apply: (_tr, prev, _old, state) => {
        const a = answerAt(state);
        if (a?.qid === prev.qid && a) return prev;
        return { qid: a?.qid ?? null, emptyAtEntry: !!a && !a.text };
      },
    },
    view: () => ({
      update: (view, prevState) => {
        const before = answeredKey.getState(prevState);
        const after = answeredKey.getState(view.state);
        if (!before?.qid || !before.emptyAtEntry || after?.qid === before.qid) return;
        const qid = before.qid;
        // After this update: a view mustn't dispatch from inside its own update.
        setTimeout(() => {
          if (view.isDestroyed) return;
          const q = questionByQid(view.state.doc, qid);
          if (!q || q.node.attrs.status !== 'open' || !answerOf(q.node)) return;
          const tr = closeHistory(view.state.tr).setNodeMarkup(q.pos, undefined, { ...q.node.attrs, status: 'answered', answeredAt: q.node.attrs.answeredAt ?? new Date().toISOString() });
          view.dispatch(tr);
        }, 0);
      },
    }),
  });
}

export const QuestionBehaviour = Extension.create({
  name: 'questionBehaviour',
  priority: 110,

  addKeyboardShortcuts() {
    const run = (cmd: Command) => () => cmd(this.editor.state, this.editor.view.dispatch);
    return {
      Enter: run(questionEnter),
      Tab: run(questionTab(1)),
      'Shift-Tab': run(questionTab(-1)),
      Backspace: run(questionBackspace),
      Delete: run(questionDelete),
    };
  },

  addProseMirrorPlugins() {
    const editor: Editor = this.editor;
    const ctx = () => objectTriggerStorage(editor).getContext();
    return [new Plugin({ key: questionKey, props: { decorations: (state) => questionDecorations(state, ctx) } }), answeredOnLeavePlugin()];
  },
});

export const QuestionExtensions = [QuestionBlock, QuestionText, QuestionFieldNode, QuestionBehaviour];

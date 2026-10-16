import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { createUnsureIcon } from '@/components/Icons';
import { asQuestion, findUnsureTrigger, sentenceEndingAt } from '@/utils/unsureFlag';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { openBlockPopover, placeBlock, popoverClass } from './blockDesigns';
import { typingOfferPlugin, type TypingOfferMatch } from './typingOffer';
import { registerMarginSource } from './MarginColumn';

// The Unsure flag (2026-10-17): a passage you're not sure of, flagged where it is. Agreed with the
// user: it flags a passage (not a block of its own); typing `(?)` after a sentence offers to flag
// that sentence (the chip, "Offer as you type"); `\unsure` flags the sentence before it, and `\` on
// selected text (or right-click) flags exactly that text.
//
//   unsureFlag  the mark: flagId (one flag across the pieces of its passage), reason (why you're
//               unsure, optional), qid (the question it was turned into, if it was)
//
// The text gets a dotted underline (CSS on the mark: a text style, so drawing it per piece is
// fine); its icon, a question mark in a broken ring, is drawn ONCE, after the passage's last piece
// (a decoration, never CSS per mark element). Clicking the icon opens a small popover: the reason,
// Turn into a question (or Go to the question), and Resolved (takes the flag off).
//
// "Turn into a question": a question block after the paragraph, its text the passage worded as a
// question for you to reword, its "why it matters" the reason. The flag stays and points at it, and
// its icon says whether the question has been answered, so the doubt and the question it became
// stay connected.

export interface FlagAttrs { flagId: string; reason: string | null; qid: string | null }

const str = (name: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) || null,
  renderHTML: (a: Record<string, unknown>) => {
    const key = name === 'flag-id' ? 'flagId' : name;
    return a[key] ? { [`data-${name}`]: a[key] } : {};
  },
});

export const UnsureFlagMark = Mark.create({
  name: 'unsureFlag',
  inclusive: false,

  addAttributes() {
    return { flagId: str('flag-id'), reason: str('reason'), qid: str('qid') };
  },

  parseHTML() { return [{ tag: 'span[data-unsure-flag]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-unsure-flag': '' }), 0]; },
});

// ── Reading flags ────────────────────────────────────────────────────────────

export interface FlagRun extends FlagAttrs { from: number; to: number }

// Every flag in the document, its passage from its first piece to its last.
export function collectFlags(doc: PMNode): FlagRun[] {
  const runs = new Map<string, FlagRun>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type.name !== 'unsureFlag' || !m.attrs.flagId) continue;
      const id = m.attrs.flagId as string;
      const run = runs.get(id);
      if (run) run.to = pos + node.nodeSize;
      else runs.set(id, { flagId: id, reason: m.attrs.reason, qid: m.attrs.qid, from: pos, to: pos + node.nodeSize });
    }
    return false;
  });
  return [...runs.values()];
}

export const flagAt = (doc: PMNode, pos: number): FlagRun | null =>
  collectFlags(doc).find((f) => pos >= f.from && pos <= f.to) ?? null;

const flagById = (doc: PMNode, flagId: string) => collectFlags(doc).find((f) => f.flagId === flagId) ?? null;

function questionById(doc: PMNode, qid: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'questionBlock' && node.attrs.qid === qid) { found = { node, pos }; return false; }
    return true;
  });
  return found;
}

// ── Making and changing ──────────────────────────────────────────────────────

// Flags from..to (selected text). Text already flagged in that range joins the new flag.
export function flagRange(tr: Transaction, from: number, to: number, reason: string | null = null): Transaction | null {
  const type = tr.doc.type.schema.marks.unsureFlag;
  if (!type || from >= to || !tr.doc.textBetween(from, to).trim()) return null;
  return tr.removeMark(from, to, type).addMark(from, to, type.create({ flagId: nanoid(10), reason, qid: null }));
}

// `\unsure` typed at from..to: the typed text goes and the sentence before it is flagged.
export function flagSentenceBefore(state: EditorState, from: number, to: number): Transaction {
  const tr = state.tr.delete(from, to);
  const $at = tr.doc.resolve(from);
  if (!$at.parent.isTextblock) return tr;
  const text = $at.parent.textBetween(0, $at.parentOffset, undefined, '￼');
  const s = sentenceEndingAt(text, text.length);
  if (s) flagRange(tr, $at.start() + s.from, $at.start() + s.to);
  return tr;
}

function setFlagAttrs(view: EditorView, flagId: string, attrs: Partial<FlagAttrs>): void {
  const run = flagById(view.state.doc, flagId);
  const type = view.state.schema.marks.unsureFlag;
  if (!run || !type) return;
  const next = { flagId, reason: run.reason, qid: run.qid, ...attrs };
  const tr = view.state.tr;
  // Only the pieces that carry this flag (a passage may run round other marks).
  view.state.doc.nodesBetween(run.from, run.to, (node, pos) => {
    if (!node.isText || !node.marks.some((m) => m.type === type && m.attrs.flagId === flagId)) return;
    const a = Math.max(pos, run.from);
    const b = Math.min(pos + node.nodeSize, run.to);
    tr.removeMark(a, b, type).addMark(a, b, type.create(next));
  });
  view.dispatch(tr);
}

export const setFlagReason = (view: EditorView, flagId: string, reason: string) =>
  setFlagAttrs(view, flagId, { reason: reason.trim() || null });

// Resolved: the flag comes off; the words stay.
export function resolveFlag(view: EditorView, flagId: string): void {
  const run = flagById(view.state.doc, flagId);
  const type = view.state.schema.marks.unsureFlag;
  if (!run || !type) return;
  const tr = view.state.tr;
  view.state.doc.nodesBetween(run.from, run.to, (node, pos) => {
    const m = node.isText ? node.marks.find((x) => x.type === type && x.attrs.flagId === flagId) : null;
    if (m) tr.removeMark(Math.max(pos, run.from), Math.min(pos + node.nodeSize, run.to), m);
  });
  view.dispatch(tr);
}

// Turn into a question: a question block after the passage's paragraph (its text the passage as a
// question, its "why it matters" the reason), the cursor at the end of its text to reword it, and
// the flag pointing at it. A flag already turned into a question goes to that question instead.
export function flagToQuestion(view: EditorView, flagId: string): void {
  const { state } = view;
  const run = flagById(state.doc, flagId);
  const { questionBlock, questionText, questionField } = state.schema.nodes;
  if (!run || !questionBlock) return;
  const existing = run.qid ? questionById(state.doc, run.qid) : null;
  if (existing) {
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, existing.pos + 1 + existing.node.child(0).nodeSize - 1)).scrollIntoView());
    view.focus();
    return;
  }
  const qid = nanoid(10);
  const text = asQuestion(state.doc.textBetween(run.from, run.to, ' '));
  const parts = [questionText.create(null, state.schema.text(text))];
  if (run.reason && questionField) parts.push(questionField.create({ field: 'why' }, state.schema.text(run.reason)));
  const tr = state.tr;
  const at = placeBlock(tr, run.to, questionBlock.create({ qid }, parts));
  if (at === null) return;
  const type = state.schema.marks.unsureFlag;
  tr.doc.nodesBetween(run.from, run.to, (node, pos) => {
    if (!node.isText || !node.marks.some((m) => m.type === type && m.attrs.flagId === flagId)) return;
    const a = Math.max(pos, run.from);
    const b = Math.min(pos + node.nodeSize, run.to);
    tr.removeMark(a, b, type).addMark(a, b, type.create({ flagId, reason: run.reason, qid }));
  });
  tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length + 1)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
}

// ── The icon after a flagged passage, and its popover ────────────────────────

type FlagState = 'open' | 'question' | 'answered';

function flagState(doc: PMNode, f: FlagRun): FlagState {
  if (!f.qid) return 'open';
  const q = questionById(doc, f.qid);
  return q?.node.attrs.status === 'answered' ? 'answered' : 'question';
}

function markerWidget(view: EditorView, f: FlagRun, state: FlagState): HTMLElement {
  const L = LABELS.unsureFlag;
  const b = document.createElement('button');
  b.type = 'button';
  b.contentEditable = 'false';
  b.setAttribute('data-unsure-marker', state);
  const title = state === 'answered' ? L.markerAnswered : state === 'question' ? L.markerQuestion : (f.reason ? L.markerWhy(f.reason) : L.marker);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.append(createUnsureIcon());
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    openFlagPopover(view, f.flagId, b.getBoundingClientRect());
  });
  return b;
}

function openFlagPopover(view: EditorView, flagId: string, anchor: DOMRect): void {
  const L = LABELS.unsureFlag;
  openBlockPopover(anchor, (close) => {
    const run = flagById(view.state.doc, flagId);
    const wrap = document.createElement('div');
    wrap.setAttribute('data-unsure-popover', '');
    const heading = document.createElement('div');
    heading.className = popoverClass.heading;
    heading.textContent = L.why;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = popoverClass.input;
    input.value = run?.reason ?? '';
    input.placeholder = L.whyHint;
    input.setAttribute('aria-label', L.why);
    const save = () => { if (input.value !== (run?.reason ?? '')) setFlagReason(view, flagId, input.value); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); close(); view.focus(); }
    });
    input.addEventListener('blur', save);
    const actions = document.createElement('div');
    actions.className = popoverClass.row;
    const button = (text: string, run: () => void) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = popoverClass.choice;
      el.textContent = text;
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', () => { save(); close(); run(); });
      actions.append(el);
    };
    button(run?.qid && questionById(view.state.doc, run.qid) ? L.goToQuestion : L.toQuestion, () => flagToQuestion(view, flagId));
    button(L.resolve, () => { resolveFlag(view, flagId); view.focus(); });
    wrap.append(heading, input, actions);
    setTimeout(() => input.focus(), 0);
    return wrap;
  });
}

function flagDecorations(doc: PMNode): DecorationSet {
  const decos = collectFlags(doc).map((f) => {
    const state = flagState(doc, f);
    return Decoration.widget(f.to, (view) => markerWidget(view, f, state), {
      side: -1, key: `unsure-${f.flagId}-${state}-${f.reason ?? ''}`, ignoreSelection: true, stopEvent: () => true,
    });
  });
  return DecorationSet.create(doc, decos);
}

// Each flag in the margin column too (extensions/MarginColumn.ts); its icon after the passage stays
// (agreed with the user 2026-10-17: a mark keeps its look in the text).
registerMarginSource('unsure', (state) => collectFlags(state.doc).map((f) => {
  const st = flagState(state.doc, f);
  const L = LABELS.unsureFlag;
  return {
    key: `unsure-${f.flagId}`,
    from: f.from,
    to: f.to,
    icon: () => createUnsureIcon(),
    color: st === 'question' ? 'var(--color-primary)' : 'var(--color-muted)',
    title: st === 'answered' ? L.markerAnswered : st === 'question' ? L.markerQuestion : (f.reason ? L.markerWhy(f.reason) : L.marker),
    open: (view, anchor) => openFlagPopover(view, f.flagId, anchor),
  };
}));

// ── `(?)` as you type ────────────────────────────────────────────────────────

interface UnsureOffer extends TypingOfferMatch { triggerFrom: number; triggerTo: number }

export function findUnsureOffer(state: EditorState, typed: string): UnsureOffer | null {
  if (typed !== ')' || !state.selection.empty) return null;
  const $c = state.selection.$from;
  if (!$c.parent.isTextblock || $c.parent.type.spec.code || $c.marks().some((m) => m.type.name === 'code')) return null;
  const before = $c.parent.textBetween(0, $c.parentOffset, undefined, '￼');
  const t = findUnsureTrigger(before);
  if (!t) return null;
  const start = $c.start();
  return {
    from: start + t.sentence.from, to: start + t.sentence.to,
    id: before.slice(t.sentence.from, t.sentence.to),
    triggerFrom: start + t.trigger.from, triggerTo: start + t.trigger.to,
  };
}

function acceptUnsure(state: EditorState, o: UnsureOffer): Transaction | null {
  if (state.doc.textBetween(o.triggerTo - 3, o.triggerTo) !== '(?)') return null;
  const tr = state.tr.delete(o.triggerFrom, o.triggerTo);
  return flagRange(tr, o.from, o.to);
}

const decoKey = new PluginKey<DecorationSet>('unsureFlagMarkers');

export const UnsureFlag = Extension.create({
  name: 'unsureFlag',
  // Alongside the other typing offers: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const ctx = () => objectTriggerStorage(this.editor).getContext();
    return [
      new Plugin<DecorationSet>({
        key: decoKey,
        state: {
          init: (_, state) => flagDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? flagDecorations(tr.doc) : old),
        },
        props: { decorations: (state) => decoKey.getState(state) },
      }),
      typingOfferPlugin<UnsureOffer>({
        name: 'unsureOffer',
        find: (state, typed) => findUnsureOffer(state, typed),
        chip: () => ({ text: LABELS.unsureFlag.offer, title: LABELS.unsureFlag.offerTitle }),
        accept: (state, o) => acceptUnsure(state, o),
      }, () => ctx()?.noteId ?? null),
    ];
  },
});

export const UnsureFlagExtensions = [UnsureFlagMark, UnsureFlag];

import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Mark } from '@tiptap/pm/model';
import { useUIStore, type PendingArtifactLink } from '@/store/uiStore';
import { showToast } from '@/components/Toast/showToast';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { LABELS } from '@/config/labels';
import type { CrossAppRef } from '@/types';
import type { AnyNoteObjectKind, NoteObjectContext } from './types';
import { getSession, withSessionMeta } from './session';
import { ARTIFACT_TYPES } from './artifactTypes';

// Everything that changes a `\` session, for the key handling (NoteObjectTrigger) and the menu
// (NoteObjectMenu) alike — neither does any of it itself.

// Starts a session at the cursor as if `\` had been typed: the editor toolbar's button, and the
// way in on a phone keyboard, where `\` is a few taps away. Adds a space first if the cursor
// is right after a word (a `\` only counts after a space).
export function insertObjectTrigger(view: EditorView): void {
  const { $from, from, to } = view.state.selection;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, ' ');
  view.dispatch(view.state.tr.insertText(before && !/\s/.test(before) ? ' \\' : '\\', from, to).scrollIntoView());
  view.focus();
}

export function dismissSession(view: EditorView): void {
  view.dispatch(withSessionMeta(view.state.tr, { type: 'dismiss' }));
}

export function setHighlight(view: EditorView, index: number): void {
  view.dispatch(withSessionMeta(view.state.tr, { type: 'highlight', index }));
}

export function setOverride(view: EditorView, key: string, value: string): void {
  view.dispatch(withSessionMeta(view.state.tr, { type: 'override', key, value }));
}

// Picking → composing: the typed keyword becomes the kind's full keyword and a space.
export function acceptKind(view: EditorView, kind: AnyNoteObjectKind): void {
  const s = getSession(view.state);
  if (!s || s.interp.phase !== 'picking') return;
  const tr = view.state.tr.insertText(`${kind.id} `, s.anchor + 1, s.to);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, s.anchor + 2 + kind.id.length)).scrollIntoView());
}

// The draft: what the body says, then each field typed into the preview on top. `invalid` lists
// the fields whose typed value couldn't be understood (they're left as the body had them).
export function resolveDraft(kind: AnyNoteObjectKind, body: string, overrides: Record<string, string>, ctx: NoteObjectContext) {
  let draft = kind.parse(body, ctx);
  const invalid: string[] = [];
  for (const [key, raw] of Object.entries(overrides)) {
    const next = kind.applyField(draft, key, raw, ctx);
    if (next === null) invalid.push(key);
    else draft = next;
  }
  return { draft, invalid };
}

// Enter (quick): create it and replace what was typed with its title, linked to it — the date,
// time and the rest now live in the item, so the note doesn't repeat them. Toast with Undo, which
// also puts the original words back.
// Ctrl+Enter (full): hand the draft to the kind's full creation pane. Its link back to the note is
// made whatever was typed (even nothing): on creation the text becomes the final title, linked.
// Either way the keyword (`\reminder `) goes. Returns whether it went ahead.
export function commitSession(view: EditorView, mode: 'quick' | 'full', ctx: NoteObjectContext): boolean {
  const state = view.state;
  const s = getSession(state);
  if (!s || s.interp.phase !== 'composing') return false;
  const { kind, body } = s.interp;
  const { draft, invalid } = resolveDraft(kind, body, s.overrides, ctx);
  if (mode === 'quick') {
    const field = invalid.length ? kind.fields(draft).find((f) => f.key === invalid[0]) : null;
    const error = field ? LABELS.noteObjects.invalidField(field.label) : kind.validate(draft);
    if (error) {
      view.dispatch(withSessionMeta(state.tr, { type: 'error', message: error }));
      return false;
    }
  }

  const markType = state.schema.marks.artifactLink;
  const typed = body.trim();
  const from = s.anchor;
  const title = kind.linkText(draft).trim();
  const text = title || typed;
  const to = from + text.length;
  const tr = withSessionMeta(state.tr.insertText(text, s.anchor, s.to), { type: 'dismiss' });
  tr.setSelection(TextSelection.create(tr.doc, to));

  if (mode === 'full') {
    view.dispatch(tr);
    useUIStore.getState().setPendingArtifactLink({
      noteId: ctx.noteId, from, to, targetType: kind.targetType, tabId: ctx.tabId, replaceWithTitle: true,
    });
    kind.openFull(draft, ctx);
    return true;
  }

  const backLinks: CrossAppRef[] = [{ type: 'note', id: ctx.noteId, ...(ctx.tabId ? { tabId: ctx.tabId } : {}) }];
  const targetId = kind.create(draft, ctx, backLinks);
  if (to > from) tr.addMark(from, to, markType.create({ targetType: kind.targetType, targetId }));
  // What's typed next mustn't join the link. Set after the last step: a step clears stored marks.
  tr.setStoredMarks(tr.doc.resolve(to).marks().filter((m: Mark) => m.type !== markType));
  view.dispatch(tr.scrollIntoView());

  showToast({
    message: LABELS.noteObjects.created(kind.label),
    detail:  kind.describe(draft),
    actions: [
      { label: LABELS.noteObjects.open, onClick: () => { openArtifactTarget(kind.targetType, targetId); } },
      { label: LABELS.noteObjects.undo, onClick: () => { kind.discard(targetId); unlinkArtifact(view, kind.targetType, targetId, typed); } },
    ],
  });
  return true;
}

// A pending link (Ctrl+Q's Create menu, or a `\` object's full pane) whose item now exists: link
// the text to it. For a `\` object the text first becomes the item's final title (the pane may
// have changed it, or nothing was typed at all).
export function applyResolvedArtifactLink(view: EditorView, pending: PendingArtifactLink & { resolvedTargetId: string }): void {
  const { state } = view;
  const markType = state.schema.marks.artifactLink;
  const size = state.doc.content.size;
  const from = Math.min(pending.from, size);
  let to = Math.min(pending.to, size);
  const tr = state.tr;
  if (pending.replaceWithTitle) {
    const title = ARTIFACT_TYPES[pending.targetType]?.summarize(pending.resolvedTargetId)?.title.trim();
    if (title) {
      tr.insertText(title, from, to);
      to = from + title.length;
    }
  }
  if (to > from) tr.addMark(from, to, markType.create({ targetType: pending.targetType, targetId: pending.resolvedTargetId }));
  if (pending.replaceWithTitle) {
    tr.setSelection(TextSelection.create(tr.doc, to));
    tr.setStoredMarks(tr.doc.resolve(to).marks().filter((m: Mark) => m.type !== markType));
  } else {
    tr.setSelection(TextSelection.create(tr.doc, from, to));
  }
  view.dispatch(tr);
}

// Removes the links to one item from the open document, leaving the text — or, with
// `restoreText`, putting that back in place of the (first) linked text (the toast's Undo).
export function unlinkArtifact(view: EditorView, targetType: string, targetId: string, restoreText?: string): void {
  if (view.isDestroyed) return;
  const { state } = view;
  const tr = state.tr;
  const ranges: { from: number; to: number }[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === 'artifactLink' && m.attrs.targetType === targetType && m.attrs.targetId === targetId);
    if (!mark) return;
    const last = ranges[ranges.length - 1];
    if (last && last.to === pos) last.to = pos + node.nodeSize;
    else ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  if (ranges.length === 0) return;
  const markType = state.schema.marks.artifactLink;
  for (const r of ranges) tr.removeMark(r.from, r.to, markType);
  if (restoreText) tr.insertText(restoreText, ranges[0].from, ranges[0].to);
  view.dispatch(tr);
}

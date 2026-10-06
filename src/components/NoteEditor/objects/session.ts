import { PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { interpretQuery, type ObjectQuery } from './kinds';

// The `\` session: from the moment `\` is typed until the object is created or the session ends.
// Its text lives in the document like any other text; this state only says where it starts, how
// far it reaches and what the person chose in the menu. Everything else (the kind, the body) is
// re-read from the text on every transaction, so undo, IME composition and edits in the middle
// all just work.

export interface ObjectSession {
  anchor:    number;                  // position of the `\`
  to:        number;                  // end of what's been typed for it
  query:     string;                  // the text between them
  interp:    ObjectQuery;
  highlight: number;                  // picking: the highlighted kind
  navigated: boolean;                 // picking: arrows used (Enter then picks even with no query)
  overrides: Record<string, string>;  // composing: fields typed into the preview, by key
  error:     string | null;           // composing: why the last Enter didn't create it
}

export type ObjectSessionMeta =
  | { type: 'dismiss' }
  | { type: 'highlight'; index: number }
  | { type: 'override'; key: string; value: string }
  | { type: 'error'; message: string | null };

export const objectSessionKey = new PluginKey<ObjectSession | null>('noteObjectSession');

export const getSession = (state: EditorState): ObjectSession | null => objectSessionKey.getState(state) ?? null;

export const withSessionMeta = (tr: Transaction, meta: ObjectSessionMeta): Transaction => tr.setMeta(objectSessionKey, meta);

const MAX_QUERY = 300;

// Did this transaction type a `\` that starts a session? Only typing counts (not paste, not a
// `\` already there), only at the start of a line or after a space (so `C:\Users` and `a\b` are
// left alone), and never in code. Returns the `\`'s position.
export function startedSession(tr: Transaction, state: EditorState): number | null {
  if (!tr.docChanged || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('paste')) return null;
  const sel = state.selection;
  if (!sel.empty) return null;
  const $head = sel.$head;
  const parent = $head.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const offset = $head.parentOffset;
  if (offset < 1) return null;
  const before = parent.textBetween(Math.max(0, offset - 2), offset, undefined, ' ');
  if (!before.endsWith('\\')) return null;
  if (before.length === 2 && !/\s/.test(before[0])) return null;
  if (state.doc.resolve(sel.head - 1).marks().some((m) => m.type.spec.code)) return null;
  const typed = tr.steps.some((step) => step instanceof ReplaceStep
    && step.slice.content.textBetween(0, step.slice.content.size, '', '').endsWith('\\'));
  return typed ? sel.head - 1 : null;
}

export function applySession(tr: Transaction, prev: ObjectSession | null, state: EditorState): ObjectSession | null {
  const meta = tr.getMeta(objectSessionKey) as ObjectSessionMeta | undefined;
  if (meta?.type === 'dismiss') return null;

  let anchor: number;
  let to: number;
  if (prev) {
    if (tr.docChanged) {
      const a = tr.mapping.mapResult(prev.anchor, 1);
      if (a.deleted) return null;
      anchor = a.pos;
      to = tr.mapping.map(prev.to, 1);
    } else {
      anchor = prev.anchor;
      to = prev.to;
    }
  } else {
    const started = startedSession(tr, state);
    if (started === null) return null;
    anchor = started;
    to = started + 1;
  }

  // The cursor must stay inside what's being typed: clicking or arrowing out of it ends it.
  const sel = state.selection;
  if (!sel.empty || sel.head <= anchor || sel.head > to) return null;
  const doc = state.doc;
  if (to > doc.content.size) return null;
  const $anchor = doc.resolve(anchor);
  if (!$anchor.parent.isTextblock || !$anchor.sameParent(doc.resolve(to))) return null;
  if (doc.textBetween(anchor, anchor + 1) !== '\\') return null;
  const query = doc.textBetween(anchor + 1, to, '\n', ' ');
  if (query.length > MAX_QUERY) return null;
  const interp = interpretQuery(query);
  if (!interp) return null;

  const samePicking = prev?.interp.phase === 'picking' && interp.phase === 'picking' && prev.interp.word === interp.word;
  const sameKind = prev?.interp.phase === 'composing' && interp.phase === 'composing' && prev.interp.kind === interp.kind;
  const next: ObjectSession = {
    anchor, to, query, interp,
    highlight: samePicking ? prev!.highlight : 0,
    navigated: samePicking ? prev!.navigated : false,
    overrides: sameKind ? prev!.overrides : {},
    error:     tr.docChanged ? null : prev?.error ?? null,
  };
  if (meta?.type === 'highlight') { next.highlight = meta.index; next.navigated = true; }
  if (meta?.type === 'override') { next.overrides = { ...next.overrides, [meta.key]: meta.value }; next.error = null; }
  if (meta?.type === 'error') next.error = meta.message;
  if (interp.phase === 'picking') next.highlight = Math.min(next.highlight, Math.max(0, interp.matches.length - 1));
  return next;
}

// What's being typed looks like one draft object (data-object-draft); once a kind is chosen, its
// keyword reads as a token with the kind's icon (data-object-keyword). Drawn as non-overlapping
// pieces (data-object-part: whole | head | tail) so the outline has no seam where they meet.
export function sessionDecorations(state: EditorState): DecorationSet | null {
  const s = getSession(state);
  if (!s) return null;
  const phase = s.interp.phase;
  if (s.interp.phase === 'picking') {
    return DecorationSet.create(state.doc, [Decoration.inline(s.anchor, s.to, { 'data-object-draft': phase, 'data-object-part': 'whole' })]);
  }
  const headEnd = s.anchor + s.interp.keywordLength;
  const decos = [Decoration.inline(s.anchor, headEnd, {
    'data-object-draft':   phase,
    'data-object-part':    s.to > headEnd ? 'head' : 'whole',
    'data-object-keyword': s.interp.kind.id,
    'data-object-icon':    s.interp.kind.icon,
  })];
  if (s.to > headEnd) decos.push(Decoration.inline(headEnd, s.to, { 'data-object-draft': phase, 'data-object-part': 'tail' }));
  return DecorationSet.create(state.doc, decos);
}

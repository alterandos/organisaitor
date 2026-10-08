import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ReplaceStep } from '@tiptap/pm/transform';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { glossaryEntries } from '@/services/glossary';
import { LABELS } from '@/config/labels';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { getSession } from '../objects/session';

// Linking to the Glossary as you type (2026-10-07): when the word just typed is a term defined
// somewhere in Notes (a Definition, Concept or Acronym — services/glossary.ts), a quiet chip
// offers to link it: Enter or Tab links it (a conceptRef mark, drawn by ConceptRef.ts), anything
// else — keep typing — and the offer goes. Backspace straight after linking (or Ctrl+Z) takes the
// link off again.
//
// Offered once per note per term (the convention of linking a term's first mention, not every
// one): not again in a note that already links it, and not again in a note where the offer was
// passed over this session. Never inside code, inside a link already, or in the term's own
// definition.

interface Term { entryId: string; typeKey: string; term: string; lower: string; icon: string; meaning: string }
export interface AutolinkSuggestion { from: number; to: number; term: Term }

interface AutolinkState {
  suggestion: AutolinkSuggestion | null;
  linked:     { from: number; to: number; entryId: string } | null;   // just accepted: Backspace undoes it
}
type Meta = { accepted: AutolinkState['linked'] } | { clear: true };

const autolinkKey = new PluginKey<AutolinkState>('glossaryAutolink');
const MIN_TERM = 3;
const WORD = /[\p{L}\p{N}]/u;

// Passed-over offers, per note, for this session.
const passedOver = new Map<string, Set<string>>();
const passed = (noteId: string | null) => {
  const key = noteId ?? '';
  if (!passedOver.has(key)) passedOver.set(key, new Set());
  return passedOver.get(key)!;
};
export const forgetPassedOver = () => passedOver.clear();

// The terms, longest first (so "opportunity cost" wins over "cost"), cached until the entries or
// the decrypted cache change.
let cache: { entries: unknown; version: number; terms: Term[] } | null = null;
function terms(): Term[] {
  const entries = useNoteStore.getState().structuredTagEntries;
  const version = useSecretsVersion.getState().version;
  if (cache && cache.entries === entries && cache.version === version) return cache.terms;
  const list = glossaryEntries()
    .filter((e) => !e.locked && e.term.trim().length >= MIN_TERM)
    .map((e) => ({ entryId: e.id, typeKey: e.typeKey, term: e.term.trim(), lower: e.term.trim().toLowerCase(), icon: e.icon, meaning: e.meaning }))
    .sort((a, b) => b.lower.length - a.lower.length);
  cache = { entries, version, terms: list };
  return list;
}

const linksTo = (doc: PMNode, entryId: string) => {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.marks.some((m) => m.type.name === 'conceptRef' && m.attrs.entryId === entryId)) found = true;
    return !found;
  });
  return found;
};

// The term the cursor is at the end of, if it should be offered. Plurals ("eukaryotes") count.
export function findSuggestion(state: EditorState, noteId: string | null, all: Term[] = terms()): AutolinkSuggestion | null {
  const { selection } = state;
  if (!selection.empty || getSession(state)) return null;
  const $c = selection.$from;
  const parent = $c.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($c.marks().some((m) => ['conceptRef', 'code', 'artifactLink', 'link'].includes(m.type.name))) return null;
  const offset = $c.parentOffset;
  const next = parent.textBetween(offset, Math.min(parent.content.size, offset + 1), undefined, '￼');
  if (next && WORD.test(next)) return null;
  const before = parent.textBetween(Math.max(0, offset - 80), offset, undefined, '￼');
  const lower = before.toLowerCase();
  const skip = passed(noteId);
  for (const term of all) {
    for (const suffix of ['', 's', 'es']) {
      const word = term.lower + suffix;
      if (!lower.endsWith(word)) continue;
      const start = lower.length - word.length;
      if (start > 0 && WORD.test(before[start - 1])) continue;
      const from = $c.pos - word.length;
      const to = $c.pos;
      let own = false;
      state.doc.nodesBetween(from, to, (n) => {
        if (n.isText && n.marks.some((m) => m.type.name === 'noteTag' && m.attrs.structuredEntryId === term.entryId)) own = true;
      });
      if (own || skip.has(term.entryId) || linksTo(state.doc, term.entryId)) break;
      return { from, to, term };
    }
  }
  return null;
}

// Typing one character (or a composed few), not a paste, a drop or a programmatic change.
function isTyping(tr: Transaction): string | null {
  if (tr.steps.length !== 1 || tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('uiEvent') === 'drop') return null;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep)) return null;
  const text = step.slice.content.textBetween(0, step.slice.content.size, '', '');
  return text.length > 0 && text.length <= 4 ? text : null;
}

export function acceptSuggestion(view: EditorView): boolean {
  const s = autolinkKey.getState(view.state)?.suggestion;
  const type = view.state.schema.marks.conceptRef;
  if (!s || !type) return false;
  // Its own undo step: Ctrl+Z takes the link off, not the typing before it.
  const tr = closeHistory(view.state.tr).addMark(s.from, s.to, type.create({ entryId: s.term.entryId, typeKey: s.term.typeKey }));
  view.dispatch(tr.setMeta(autolinkKey, { accepted: { from: s.from, to: s.to, entryId: s.term.entryId } } satisfies Meta));
  return true;
}

function chip(view: EditorView, s: AutolinkSuggestion): HTMLElement {
  const L = LABELS.glossary;
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.setAttribute('data-autolink-chip', '');
  el.title = s.term.meaning ? `${s.term.term}: ${s.term.meaning}` : s.term.term;
  const key = document.createElement('kbd');
  key.textContent = '↵';
  const text = document.createElement('span');
  text.textContent = L.autolinkOffer;
  const term = document.createElement('b');
  term.textContent = `${s.term.icon} ${s.term.term}`;
  el.append(key, text, term);
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => { e.preventDefault(); acceptSuggestion(view); });
  return el;
}

export const GlossaryAutolink = Extension.create({
  name: 'glossaryAutolink',
  // Before the blocks' keys and the editor's own: Enter and Tab are the offer's while it shows.
  priority: 130,

  addProseMirrorPlugins() {
    const noteId = () => objectTriggerStorage(this.editor).getContext()?.noteId ?? null;
    return [new Plugin<AutolinkState>({
      key: autolinkKey,
      state: {
        init: () => ({ suggestion: null, linked: null }),
        apply: (tr, prev, _old, state) => {
          const meta = tr.getMeta(autolinkKey) as Meta | undefined;
          if (meta && 'accepted' in meta) return { suggestion: null, linked: meta.accepted };
          if (meta && 'clear' in meta) return { suggestion: null, linked: null };
          if (!tr.docChanged) return tr.selectionSet ? { suggestion: null, linked: null } : prev;
          const typed = isTyping(tr);
          if (typed === null) return { suggestion: null, linked: null };
          const suggestion = findSuggestion(state, noteId());
          // Typed on past the offer (a space, a full stop…): passed over, for this note.
          if (prev.suggestion && !suggestion && !WORD.test(typed)) passed(noteId()).add(prev.suggestion.term.entryId);
          return { suggestion, linked: null };
        },
      },
      props: {
        decorations: (state) => {
          const s = autolinkKey.getState(state)?.suggestion;
          if (!s) return null;
          return DecorationSet.create(state.doc, [
            Decoration.inline(s.from, s.to, { 'data-autolink': '' }),
            Decoration.widget(s.to, (view) => chip(view, s), { side: 1, key: `autolink-${s.term.entryId}-${s.from}`, ignoreSelection: true, stopEvent: () => true }),
          ]);
        },
        handleKeyDown: (view, event) => {
          const st = autolinkKey.getState(view.state);
          if (!st || event.ctrlKey || event.metaKey || event.altKey) return false;
          if (st.suggestion && (event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
            event.preventDefault();
            return acceptSuggestion(view);
          }
          if (st.suggestion && event.key === 'Escape') {
            event.stopPropagation();
            passed(noteId()).add(st.suggestion.term.entryId);
            view.dispatch(view.state.tr.setMeta(autolinkKey, { clear: true } satisfies Meta));
            event.preventDefault();
            return true;
          }
          if (st.linked && event.key === 'Backspace') {
            const { from, to, entryId } = st.linked;
            passed(noteId()).add(entryId);
            const tr = view.state.tr.removeMark(from, to, view.state.schema.marks.conceptRef);
            view.dispatch(tr.setMeta(autolinkKey, { clear: true } satisfies Meta));
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    })];
  },
});

import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ReplaceStep } from '@tiptap/pm/transform';
import { closeHistory } from '@tiptap/pm/history';

// "Offer as you type" (CLAUDE.md, adopted 2026-10-13): a quiet chip after what was just typed that
// offers to do something with it (link a Glossary term, record an acronym…). Every offer behaves
// the same, because they all come from here:
//   - shown only while typing (not after a paste or a programmatic change), the text it's about
//     highlighted, the chip at the cursor;
//   - Enter or Tab accepts it (a click on the chip too), as its own undo step;
//   - Esc, or typing on past it, passes it over: not offered again for the same thing in that
//     note this session;
//   - an offer can say how Backspace straight after accepting takes it back.
// An offer only says what to look for (`find`), what the chip says, and what accepting does.

export interface TypingOfferMatch { from: number; to: number; id: string }

export interface TypingOfferSpec<O extends TypingOfferMatch> {
  name:   string;
  // The offer for the state just after `typed` was typed, or null.
  find:   (state: EditorState, typed: string, noteId: string | null, passedOver: ReadonlySet<string>) => O | null;
  chip:   (offer: O) => { text: string; strong?: string; title?: string };
  // What accepting does to the document (null: nothing to do). Side effects (a new record) may
  // happen here too.
  accept: (state: EditorState, offer: O) => Transaction | null;
  // Backspace straight after accepting: what takes it back (null: Backspace is left alone).
  undo?:  (state: EditorState, offer: O) => Transaction | null;
}

interface OfferState<O> { offer: O | null; accepted: O | null }
type Meta = { accepted: unknown } | { clear: true };

const WORD = /[\p{L}\p{N}]/u;

// Passed-over offers, per kind of offer and per note, for this session.
const passedOver = new Map<string, Set<string>>();
const passedFor = (name: string, noteId: string | null) => {
  const key = `${name}:${noteId ?? ''}`;
  if (!passedOver.has(key)) passedOver.set(key, new Set());
  return passedOver.get(key)!;
};
export const forgetPassedOffers = () => passedOver.clear();

// The text typed by this transaction (a character or a composed few), or null if it wasn't typing.
export function typedText(tr: Transaction): string | null {
  if (tr.steps.length !== 1 || tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('uiEvent') === 'drop') return null;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep)) return null;
  const text = step.slice.content.textBetween(0, step.slice.content.size, '', '');
  return text.length > 0 && text.length <= 4 ? text : null;
}

export function typingOfferPlugin<O extends TypingOfferMatch>(spec: TypingOfferSpec<O>, noteId: () => string | null): Plugin<OfferState<O>> {
  const key = new PluginKey<OfferState<O>>(spec.name);
  const passed = () => passedFor(spec.name, noteId());

  const accept = (view: EditorView): boolean => {
    const offer = key.getState(view.state)?.offer;
    if (!offer) return false;
    const tr = spec.accept(view.state, offer);
    if (!tr) return false;
    view.dispatch(closeHistory(tr).setMeta(key, { accepted: offer } satisfies Meta));
    return true;
  };

  const chip = (view: EditorView, offer: O): HTMLElement => {
    const { text, strong, title } = spec.chip(offer);
    const el = document.createElement('span');
    el.contentEditable = 'false';
    el.setAttribute('data-autolink-chip', '');
    if (title) el.title = title;
    const kbd = document.createElement('kbd');
    kbd.textContent = '↵';
    const label = document.createElement('span');
    label.textContent = text;
    el.append(kbd, label);
    if (strong) { const b = document.createElement('b'); b.textContent = strong; el.append(b); }
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => { e.preventDefault(); accept(view); });
    return el;
  };

  return new Plugin<OfferState<O>>({
    key,
    state: {
      init: () => ({ offer: null, accepted: null }),
      apply: (tr, prev, _old, state) => {
        const meta = tr.getMeta(key) as Meta | undefined;
        if (meta && 'accepted' in meta) return { offer: null, accepted: meta.accepted as O };
        if (meta && 'clear' in meta) return { offer: null, accepted: null };
        if (!tr.docChanged) return tr.selectionSet ? { offer: null, accepted: null } : prev;
        const typed = typedText(tr);
        if (typed === null) return { offer: null, accepted: null };
        const offer = spec.find(state, typed, noteId(), passed());
        // Typed on past the offer (a space, a full stop…): passed over, for this note.
        if (prev.offer && !offer && !WORD.test(typed)) passed().add(prev.offer.id);
        return { offer, accepted: null };
      },
    },
    props: {
      decorations: (state) => {
        const offer = key.getState(state)?.offer;
        if (!offer) return null;
        return DecorationSet.create(state.doc, [
          Decoration.inline(offer.from, offer.to, { 'data-autolink': '' }),
          Decoration.widget(state.selection.from, (view) => chip(view, offer), { side: 1, key: `${spec.name}-${offer.id}-${offer.from}`, ignoreSelection: true, stopEvent: () => true }),
        ]);
      },
      handleKeyDown: (view, event) => {
        const st = key.getState(view.state);
        if (!st || event.ctrlKey || event.metaKey || event.altKey) return false;
        if (st.offer && (event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
          event.preventDefault();
          return accept(view);
        }
        if (st.offer && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          passed().add(st.offer.id);
          view.dispatch(view.state.tr.setMeta(key, { clear: true } satisfies Meta));
          return true;
        }
        if (st.accepted && spec.undo && event.key === 'Backspace') {
          const tr = spec.undo(view.state, st.accepted);
          if (!tr) return false;
          passed().add(st.accepted.id);
          view.dispatch(tr.setMeta(key, { clear: true } satisfies Meta));
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });
}

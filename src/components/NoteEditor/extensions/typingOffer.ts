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
//   - it sits below the line, never in it; typing on past it doesn't make it vanish: it stays
//     LINGER_MS under the words it's about, fading out over that time,
//     and Tab or a click still accept it; Enter is a new line again by then. It goes when the
//     words it's about change, the cursor leaves the line, or the time is up. Agreed 2026-10-13:
//     people type straight on, and an offer that vanished on the next key was easy to miss;
//   - Esc, or letting it go, passes it over: not offered again for the same thing in that
//     note this session;
//   - an offer can say how Backspace straight after accepting takes it back.
// An offer only says what to look for (`find`), what the chip says, and what accepting does.

export interface TypingOfferMatch { from: number; to: number; id: string }

// How long an offer stays after you type on past it.
export const LINGER_MS = 4000;

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

// `lingering`: typed past, still showing (until `until`); `text` is what the offer is about, so a
// change to it ends the offer.
interface OfferState<O> { offer: O | null; text: string; lingering: boolean; until: number; accepted: O | null }
const NONE = { offer: null, text: '', lingering: false, until: 0, accepted: null };
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

// The words an offer is about are still there as they were, with no letters run onto either end.
function stillAbout(state: EditorState, offer: TypingOfferMatch, text: string): boolean {
  if (offer.from >= offer.to || offer.to > state.doc.content.size) return false;
  if (state.doc.textBetween(offer.from, offer.to) !== text) return false;
  const around = (a: number, b: number) => (a >= 0 && b <= state.doc.content.size ? state.doc.textBetween(a, b, '', '') : '');
  return !WORD.test(around(offer.from - 1, offer.from)) && !WORD.test(around(offer.to, offer.to + 1));
}

// The cursor is still in the block of text the offer is in.
function sameLine(state: EditorState, offer: TypingOfferMatch): boolean {
  if (offer.to > state.doc.content.size) return false;
  return state.selection.$from.sameParent(state.doc.resolve(offer.to));
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

  const chip = (view: EditorView, offer: O, lingering: boolean): HTMLElement => {
    const { text, strong, title } = spec.chip(offer);
    const el = document.createElement('span');
    el.contentEditable = 'false';
    el.setAttribute('data-autolink-chip', '');
    if (lingering) { el.setAttribute('data-lingering', ''); el.style.setProperty('--linger', `${LINGER_MS}ms`); }
    if (title) el.title = title;
    const kbd = document.createElement('kbd');
    kbd.textContent = lingering ? 'Tab' : '↵';
    const label = document.createElement('span');
    label.textContent = text;
    el.append(kbd, label);
    if (strong) { const b = document.createElement('b'); b.textContent = strong; el.append(b); }
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => { e.preventDefault(); accept(view); });
    // A zero-width anchor in the line; the chip hangs below it, so it never pushes text about.
    const anchor = document.createElement('span');
    anchor.contentEditable = 'false';
    anchor.setAttribute('data-offer-anchor', '');
    anchor.append(el);
    return anchor;
  };

  return new Plugin<OfferState<O>>({
    key,
    state: {
      init: () => NONE,
      apply: (tr, prev, _old, state): OfferState<O> => {
        const meta = tr.getMeta(key) as Meta | undefined;
        if (meta && 'accepted' in meta) return { ...NONE, accepted: meta.accepted as O };
        if (meta && 'clear' in meta) return NONE;
        if (!tr.docChanged) {
          if (!tr.selectionSet) return prev;
          return prev.lingering && prev.offer && sameLine(state, prev.offer) ? { ...prev, accepted: null } : NONE;
        }
        const typed = typedText(tr);
        const found = typed === null ? null : spec.find(state, typed, noteId(), passed());
        if (found) return { offer: found, text: state.doc.textBetween(found.from, found.to), lingering: false, until: 0, accepted: null };
        if (!prev.offer || typed === null) return NONE;
        // Typed on past it: it lingers while the words it's about are untouched and on this line.
        const offer = { ...prev.offer, from: tr.mapping.map(prev.offer.from, -1), to: tr.mapping.map(prev.offer.to, 1) };
        if (!stillAbout(state, offer, prev.text)) { passed().add(prev.offer.id); return NONE; }
        return { offer, text: prev.text, lingering: true, until: prev.lingering ? prev.until : Date.now() + LINGER_MS, accepted: null };
      },
    },
    // Ends a lingering offer when its time is up.
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        const st = key.getState(view.state);
        if (!st?.lingering || !st.offer) return;
        const id = st.offer.id;
        timer = setTimeout(() => {
          timer = null;
          const now = key.getState(view.state);
          if (!now?.lingering || now.offer?.id !== id) return;
          passed().add(id);
          view.dispatch(view.state.tr.setMeta(key, { clear: true } satisfies Meta));
        }, Math.max(0, st.until - Date.now()));
      };
      return { update: schedule, destroy: () => { if (timer) clearTimeout(timer); } };
    },
    props: {
      decorations: (state) => {
        const st = key.getState(state);
        const offer = st?.offer;
        if (!st || !offer) return null;
        // Below the line: fresh, under the cursor; lingering, under the words it's about, fading out
        // over LINGER_MS (its CSS animation).
        const at = st.lingering ? offer.to : state.selection.from;
        return DecorationSet.create(state.doc, [
          Decoration.inline(offer.from, offer.to, { 'data-autolink': '' }),
          Decoration.widget(at, (view) => chip(view, offer, st.lingering), { side: 1, key: `${spec.name}-${offer.id}-${offer.from}-${st.lingering ? 'l' : 'f'}`, ignoreSelection: true, stopEvent: () => true }),
        ]);
      },
      handleKeyDown: (view, event) => {
        const st = key.getState(view.state);
        if (!st || event.ctrlKey || event.metaKey || event.altKey) return false;
        if (st.offer && !event.shiftKey && (event.key === 'Tab' || (event.key === 'Enter' && !st.lingering))) {
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

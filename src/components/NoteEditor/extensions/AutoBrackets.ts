import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

// Brackets close themselves, as in a code editor (asked for by the user 2026-10-22). Typing `(`,
// `[` or `{` puts in the pair with the cursor between; while the cursor is still inside a pair made
// this way, typing its closing bracket steps over it, Tab jumps past it, and Backspace straight
// after the opening one takes both away. With text selected, the bracket wraps the selection. The
// pair is only put in before a space, the end of the line or closing punctuation (so "(" typed
// in front of a word stays one bracket), never in code, and `[[` still opens the note link picker.

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSES = new Set(Object.values(PAIRS));
const CLOSE_BEFORE = /^$|^[\s)\]}.,;:!?'"”’]/;

interface Pair { open: number; close: number }
interface PluginState { pairs: Pair[] }
type Meta = { add: Pair } | { drop: Pair } | { clear: true };

export const autoBracketsKey = new PluginKey<PluginState>('autoBrackets');

const inCode = (state: EditorState, pos: number) => {
  const $pos = state.doc.resolve(pos);
  return !!$pos.parent.type.spec.code || $pos.marks().some((m) => m.type.spec.code);
};

// The innermost pair made here that the cursor is still inside.
function pairAround(state: EditorState): Pair | null {
  const { from, empty } = state.selection;
  if (!empty) return null;
  const pairs = autoBracketsKey.getState(state)?.pairs ?? [];
  return pairs.filter((p) => from > p.open && from <= p.close).sort((a, b) => a.close - b.close)[0] ?? null;
}

export const AutoBrackets = Extension.create({
  name: 'autoBrackets',
  // Above the note link's `[[` (120), so the second `[` can take the first one's `]` away first.
  priority: 130,

  addProseMirrorPlugins() {
    return [new Plugin<PluginState>({
      key: autoBracketsKey,
      state: {
        init: () => ({ pairs: [] }),
        apply(tr: Transaction, value: PluginState, _old, state: EditorState): PluginState {
          const meta = tr.getMeta(autoBracketsKey) as Meta | undefined;
          let pairs = value.pairs;
          if (tr.docChanged) {
            pairs = pairs.map((p) => ({ open: tr.mapping.map(p.open, 1), close: tr.mapping.map(p.close, 1) }));
          }
          if (meta && 'clear' in meta) pairs = [];
          if (meta && 'drop' in meta) pairs = pairs.filter((p) => p.open !== meta.drop.open || p.close !== meta.drop.close);
          if (meta && 'add' in meta) pairs = [...pairs, meta.add];
          // A pair stops counting once the cursor leaves it or its closing bracket has gone.
          const { from } = state.selection;
          pairs = pairs.filter((p) => from > p.open && from <= p.close && p.close < state.doc.content.size
            && CLOSES.has(state.doc.textBetween(p.close, p.close + 1)) && state.doc.resolve(p.open).parent === state.doc.resolve(p.close).parent);
          return pairs === value.pairs ? value : { pairs };
        },
      },
      props: {
        handleTextInput(view, from, to, text) {
          const state = view.state;
          if (inCode(state, from)) return false;
          const close = PAIRS[text];
          if (close) {
            const before = state.doc.textBetween(Math.max(0, from - 1), from);
            const after = from < state.doc.content.size ? state.doc.textBetween(from, Math.min(state.doc.content.size, from + 1)) : '';
            // `[[`: take this pair's `]` away, then let the note link picker (or plain typing) carry on.
            if (text === '[' && from === to && before === '[' && after === ']' && pairAround(state)?.close === from) {
              view.dispatch(state.tr.delete(from, from + 1).setMeta(autoBracketsKey, { clear: true } satisfies Meta));
              return false;
            }
            if (from !== to) {
              const tr = state.tr.insertText(close, to).insertText(text, from);
              view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1)));
              return true;
            }
            if (!CLOSE_BEFORE.test(after)) return false;
            const tr = state.tr.insertText(text + close, from, to);
            tr.setSelection(TextSelection.create(tr.doc, from + 1)).setMeta(autoBracketsKey, { add: { open: from, close: from + 1 } } satisfies Meta);
            view.dispatch(tr);
            return true;
          }
          if (CLOSES.has(text) && from === to) {
            const pair = pairAround(state);
            if (!pair || pair.close !== from || state.doc.textBetween(from, from + 1) !== text) return false;
            // Typed over (a real replacement), so whatever reacts to a typed `)` still sees one.
            const tr = state.tr.insertText(text, from, from + 1);
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1)).setMeta(autoBracketsKey, { drop: pair } satisfies Meta));
            return true;
          }
          return false;
        },
      },
    })];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const state = this.editor.state;
        const pair = pairAround(state);
        if (!pair) return false;
        this.editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pair.close + 1)).setMeta(autoBracketsKey, { drop: pair } satisfies Meta));
        return true;
      },
      Backspace: () => {
        const state = this.editor.state;
        const pair = pairAround(state);
        if (!pair || state.selection.from !== pair.open + 1 || pair.close !== pair.open + 1) return false;
        this.editor.view.dispatch(state.tr.delete(pair.open, pair.close + 1));
        return true;
      },
    };
  },
});

import { Extension } from '@tiptap/core';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { cycleNotation, numberAt, numberForms, parseNumber } from '@/utils/numberNotation';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import type { NoteEditorMenuApi } from '../contextMenu';

// A number written another way (asked for 2026-10-23): 69000000000 → 69,000,000,000 → 6.9×10¹⁰ →
// 6.9E10. Ctrl+] / Ctrl+[ on a number steps through its forms (the rules: utils/numberNotation.ts),
// and right-click offers them all. In plain text the cursor touching a number is enough; inside a
// note block the number must be selected, since there those keys cycle the block's design
// (extensions/designCycle.ts, which this sits in front of). Each change is one undo step.

export function numberRange(state: EditorState): { from: number; to: number; text: string } | null {
  const { selection: sel } = state;
  const $from = sel.$from;
  if (!$from.parent.isTextblock || !sel.$to.sameParent($from)) return null;
  const start = $from.start();
  if (!sel.empty) {
    const text = state.doc.textBetween(sel.from, sel.to);
    return parseNumber(text) ? { from: sel.from, to: sel.to, text } : null;
  }
  for (let d = $from.depth; d > 0; d--) if (NOTE_BLOCK_NODES.has($from.node(d).type.name)) return null;
  const line = state.doc.textBetween(start, $from.end(), undefined, '￼');
  const at = numberAt(line, $from.parentOffset);
  return at ? { from: start + at.from, to: start + at.to, text: line.slice(at.from, at.to) } : null;
}

export function writeNumberAs(view: EditorView, range: { from: number; to: number }, text: string, keepSelected: boolean): void {
  const tr = closeHistory(view.state.tr.insertText(text, range.from, range.to));
  const end = range.from + text.length;
  tr.setSelection(keepSelected ? TextSelection.create(tr.doc, range.from, end) : TextSelection.create(tr.doc, end));
  view.dispatch(tr.scrollIntoView());
}

function cycle(view: EditorView, dir: 1 | -1): boolean {
  const range = numberRange(view.state);
  if (!range) return false;
  const next = cycleNotation(range.text, dir);
  if (!next) return false;
  writeNumberAs(view, range, next, !view.state.selection.empty);
  return true;
}

export const NumberNotation = Extension.create({
  name: 'numberNotation',
  priority: 110,   // ahead of DesignCycle, which takes the same keys when this lets them go

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => cycle(this.editor.view, 1),
      'Mod-[': () => cycle(this.editor.view, -1),
    };
  },
});

// Right-click on a number: its other forms, each shown as it would read.
registerContextMenuProvider({
  id: 'note-editor.number-notation',
  kind: 'note-editor',
  order: 6,
  when: (_ctx, scope) => !!numberRange((scope.data as NoteEditorMenuApi).editor.state),
  items: (_ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const range = numberRange(view.state);
    if (!range) return [];
    const forms = numberForms(range.text).filter((f) => f.text !== range.text.trim());
    if (!forms.length) return [];
    return [{
      id: 'number-format', label: LABELS.numberNotation.menu, icon: '#',
      submenu: [forms.map((f) => ({
        id: f.notation, label: `${LABELS.numberNotation.names[f.notation]}: ${f.text}`,
        run: () => writeNumberAs(view, range, f.text, !view.state.selection.empty),
      }))],
    }];
  },
});

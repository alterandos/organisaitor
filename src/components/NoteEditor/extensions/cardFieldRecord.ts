import { useNoteStore } from '@/store/noteStore';
import { entryView } from '@/services/noteSecrets';
import { LABELS } from '@/config/labels';
import { GLOSSARY_KINDS, getStructuredTagType } from '@/config/structuredTagTypes';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { NoteObjectContext } from '../objects/types';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import type { NoteEditorMenuApi } from '../contextMenu';
import { BUILTIN_TAGS } from '../builtinTags';
import { recordFromWords } from './GlossaryCard';

// Words selected in a Glossary card's field made into a record of their own, linked from there
// (2026-11-12, the user: "a function available to all cards and blocks"). In note text and in a
// block's part, `\` on the selection and right-click's Turn into already do it (cardFromSelection:
// in a part the words become a chip in place, GlossaryCard.ts goesInline); a card's fields aren't
// note text (small contentEditables, GlossaryCardBody's RichField), so this is the same for them:
// right-click › Make a record from this ▸ a kind. The words become a link to the new record
// (`<a data-term>`, as a term link typed there is), and the field saves as when typed in.

const CARD_FIELD = '[data-type="glossary-card"] [contenteditable="true"]';

export interface FieldSelection { field: HTMLElement; range: Range; words: string }

// The words selected in one card field, if that's what was right-clicked (not inside a link).
export function selectionInCardField(target: Element): FieldSelection | null {
  const field = target.closest<HTMLElement>(CARD_FIELD);
  const sel = window.getSelection();
  if (!field || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!field.contains(range.startContainer) || !field.contains(range.endContainer)) return null;
  const inLink = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest('a[data-term]');
  if (inLink(range.startContainer) || inLink(range.endContainer)) return null;
  const words = range.toString().trim();
  return words ? { field, range: range.cloneRange(), words } : null;
}

// Makes the record and puts the link in the words' place. Returns the new record's id.
export function recordFromFieldSelection(at: FieldSelection, typeKey: string, ctx: NoteObjectContext): string | null {
  const id = recordFromWords(typeKey, at.words, at.field.textContent ?? '', ctx);
  if (!id) return null;
  // An Example made from a card's words is an example of that card's record (2026-11-14, the user: the
  // links built as it's made, so study can ask "what is this an example of?").
  const host = at.field.closest('[data-type="glossary-card"]')?.getAttribute('data-entry-id');
  if (typeKey === 'instance' && host && host !== id) {
    const store = useNoteStore.getState();
    const made = store.structuredTagEntries[id as never];
    if (made) store.updateStructuredTagEntry(id as never, { fields: { ...entryView(made).fields, related: [{ kind: 'exampleOf', entryId: host }] } });
  }
  const a = document.createElement('a');
  a.setAttribute('data-term', id);
  a.appendChild(at.range.extractContents());
  at.range.insertNode(a);
  const after = document.createRange();
  after.setStartAfter(a);
  after.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(after);
  at.field.dispatchEvent(new Event('input', { bubbles: true }));
  return id;
}

registerContextMenuProvider({
  id: 'note-editor.card-field-record',
  kind: 'note-editor',
  order: 4,
  when: (ctx) => !!selectionInCardField(ctx.target),
  items: (ctx, scope) => {
    const at = selectionInCardField(ctx.target);
    const context = objectTriggerStorage((scope.data as NoteEditorMenuApi).editor).getContext();
    if (!at || !context) return [];
    return [{
      id: 'card-field-record', label: LABELS.glossaryCard.makeRecord,
      submenu: [GLOSSARY_KINDS.map((k) => ({
        id: `card-field-record-${k}`,
        label: getStructuredTagType(k)?.label ?? k,
        icon: BUILTIN_TAGS.find((t) => t.typeKey === k)?.icon,
        run: () => { recordFromFieldSelection(at, k, context); },
      }))],
    }];
  },
});

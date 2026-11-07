import { createElement } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuItem, ContextMenuScope, ContextMenuSection } from '@/contextMenu/types';
import { LABELS } from '@/config/labels';
import { setNormalText } from './extensions/normalText';
import { LinkIcon, TagIcon } from '@/components/Icons';
import { annotationActions, linkToTerm, selectionActions, termsFor, type SelectionAction, type SelectionActionGroup } from './objects/selectionActions';
import { markRange } from './textMarks';

// The Notes editor's right-click menu. NoteEditor declares a `note-editor` scope on the editing
// surface whose data is this API (the actions only it can perform); the providers below turn it
// into sections. Another feature adds to this menu by registering its own provider for
// `note-editor` (say, "Save tab as template"), without touching these.
//
// Laid out by "clicked thing first, families fold" (CLAUDE.md "Right-click menus"; tidied
// 2026-11-02, when it had grown to a dozen sections): whatever the click landed on (a heading, a
// block, a link: their own providers, orders 4–7) first; then, on selected text, its four families
// (Annotate, Turn into, Link, Send to: objects/selectionActions.ts, the list the `\` menu reads);
// then the clipboard; then formatting (section 'format'); then the note itself (section 'note').
export interface NoteEditorMenuApi {
  editor:      Editor;
  paste:       (plain: boolean) => Promise<void>;
  openLink:    () => void;   // Ctrl+L: the selection's link input, or the New link pane with none
  openCreate:  () => void;   // Ctrl+Q: the Create ▸ menu for the selection
  insertTitle: () => void;   // Ctrl+H, H
}

const api = (scope: ContextMenuScope) => scope.data as NoteEditorMenuApi;

// Cut and copy act on the editor's live DOM selection, which the menu leaves in place (it never
// takes focus), so the editor's own copy handling (ProseMirror's serialiser) runs as for Ctrl+C.
const exec = (command: 'cut' | 'copy') => () => { document.execCommand(command); };

registerContextMenuProvider({
  id: 'note-editor.clipboard',
  kind: 'note-editor',
  order: 10,
  items: (_ctx, scope) => {
    const { editor, paste } = api(scope);
    const empty = editor.state.selection.empty;
    return [
      { id: 'cut', label: LABELS.contextMenu.cut, icon: '✂', shortcut: 'Ctrl+X', disabled: empty, run: exec('cut') },
      { id: 'copy', label: LABELS.contextMenu.copy, icon: '⧉', shortcut: 'Ctrl+C', disabled: empty, run: exec('copy') },
      { id: 'paste', label: LABELS.contextMenu.paste, icon: '📋', shortcut: 'Ctrl+V', run: () => paste(false) },
      { id: 'paste-plain', label: LABELS.contextMenu.pastePlain, shortcut: 'Ctrl+Shift+V', run: () => paste(true) },
      { id: 'select-all', label: LABELS.contextMenu.selectAll, shortcut: 'Ctrl+A', run: () => { editor.chain().focus().selectAll().run(); } },
    ];
  },
});

// The actions in one family, drawn as the submenu's sections (by their set).
function bySet(actions: SelectionAction[]): ContextMenuSection[] {
  const sets = new Map<string, ContextMenuItem[]>();
  for (const a of actions) {
    const key = a.set ?? '';
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key)!.push({ id: a.key, label: a.label, icon: a.icon, run: a.run });
  }
  return [...sets.values()];
}

const MENU_TERMS = 6;

// On selected text: Mark as ▸, Turn into ▸, Link ▸, Send to ▸.
registerContextMenuProvider({
  id: 'note-editor.selection',
  kind: 'note-editor',
  order: 8,
  items: (ctx, scope) => {
    const { editor, openLink, openCreate } = api(scope);
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      // Nothing selected: Annotate ▸ for the whole line clicked (the user, 2026-11-06). A block's
      // own Annotate ▸ (textMarks.ts) covers a click inside a block.
      if (!editor.isEditable || ctx.target.closest('[data-note-block]')) return [];
      // A click outside the document's text (the editor's padding) has no position: nothing to annotate.
      const at = (() => { try { return editor.view.posAtDOM(ctx.target, 0); } catch { return null; } })();
      const line = at === null ? null : markRange(editor.state, at);
      return line ? [{ id: 'mark-as', label: LABELS.contextMenu.markAs, icon: createElement(TagIcon), submenu: bySet(annotationActions(editor, line)) }] : [];
    }
    const range = { from, to };
    const actions = selectionActions(editor, range);
    const of = (g: SelectionActionGroup) => actions.filter((a) => a.group === g);
    const C = LABELS.contextMenu;
    const items: ContextMenuItem[] = [];
    if (of('mark').length) items.push({ id: 'mark-as', label: C.markAs, icon: createElement(TagIcon), submenu: bySet(of('mark')) });
    if (editor.isEditable) {
      items.push({ id: 'turn-into', label: C.turnInto, icon: '⇢', submenu: [
        bySet(of('turn')).flat(),
        [{ id: 'create', label: C.createFrom, icon: '🧩', shortcut: 'Ctrl+Q', run: openCreate }],
      ] });
      const { terms } = termsFor(editor.state.doc.textBetween(from, to, ' '));
      const termItems: ContextMenuItem[] = terms.slice(0, MENU_TERMS).map((e) => ({
        id: `term-${e.id}`, label: e.term, icon: e.icon,
        run: () => {
          linkToTerm(editor, range, e);
          editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, to)));
        },
      }));
      items.push({ id: 'link', label: C.linkFamily, icon: createElement(LinkIcon), submenu: [
        [{ id: 'web-link', label: C.webLink, shortcut: 'Ctrl+L', run: openLink }, ...bySet(of('link')).flat()],
        ...(termItems.length ? [[{ id: 'glossary-term', label: C.glossaryTerm, icon: '📖', submenu: [termItems] }]] : []),
      ] });
    }
    if (of('send').length) items.push({ id: 'send-selection', label: LABELS.sendSelection.menu, icon: '➦', submenu: bySet(of('send')) });
    return items;
  },
});

// With nothing selected: a new web link (the New link pane), beside the formatting.
registerContextMenuProvider({
  id: 'note-editor.insert',
  kind: 'note-editor',
  order: 29,
  section: 'format',
  items: (_ctx, scope) => {
    const { editor, openLink } = api(scope);
    if (!editor.state.selection.empty) return [];
    return [{ id: 'link', label: LABELS.contextMenu.link, icon: createElement(LinkIcon), shortcut: 'Ctrl+L', run: openLink }];
  },
});

registerContextMenuProvider({
  id: 'note-editor.style',
  kind: 'note-editor',
  order: 30,
  section: 'format',
  items: (_ctx, scope) => {
    const { editor, insertTitle } = api(scope);
    const levels = [1, 2, 3, 4, 5] as const;
    return [{
      id: 'style',
      label: LABELS.contextMenu.style,
      icon: '¶',
      submenu: [
        [
          { id: 'title', label: LABELS.contextMenu.title, shortcut: 'Ctrl+H, H', run: insertTitle },
          { id: 'subtitle', label: LABELS.noteStyles.subtitle, shortcut: 'Ctrl+H, S', run: () => { editor.chain().focus().setNode('noteSubtitle').run(); } },
          { id: 'author', label: LABELS.noteStyles.author, shortcut: 'Ctrl+H, A', run: () => { editor.chain().focus().setNode('noteAuthor').run(); } },
        ],
        levels.map((level) => ({
          id: `h${level}`,
          label: LABELS.contextMenu.heading(level),
          shortcut: `Ctrl+H, ${level}`,
          run: () => { editor.chain().focus().setHeading({ level }).run(); },
        })),
        [{ id: 'normal', label: LABELS.contextMenu.normalText, shortcut: 'Ctrl+H, 0', run: () => setNormalText(editor) }],
      ],
    }];
  },
});

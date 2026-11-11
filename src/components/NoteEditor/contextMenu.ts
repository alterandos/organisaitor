import { createElement } from 'react';
import type { Editor } from '@tiptap/react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuItem, ContextMenuScope, ContextMenuSection } from '@/contextMenu/types';
import { LABELS } from '@/config/labels';
import { setNormalText } from './extensions/normalText';
import { LinkIcon } from '@/components/Icons';
import { SELECTION_SUBMENU_SETS, annotationActions, selectionActions, selectionGroup, selectionGroups, type SelectionAction } from './objects/selectionActions';
import { markRange } from './textMarks';

// The Notes editor's right-click menu. NoteEditor declares a `note-editor` scope on the editing
// surface whose data is this API (the actions only it can perform); the providers below turn it
// into sections. Another feature adds to this menu by registering its own provider for
// `note-editor` (say, "Save tab as template"), without touching these.
//
// Laid out by "clicked thing first, families fold" (CLAUDE.md "Right-click menus"; tidied
// 2026-11-02, when it had grown to a dozen sections): whatever the click landed on (a heading, a
// block, a link: their own providers, orders 4–7) first; then, on selected text, its four families
// (Turn into, Send to, Annotate, Link: objects/selectionActions.ts, the list and groups the `\` menu reads);
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

// The actions in one family, drawn as the submenu's sections (by their set); a set listed in
// SELECTION_SUBMENU_SETS (the Glossary terms) is one item with its own submenu.
function bySet(actions: SelectionAction[]): ContextMenuSection[] {
  const sets = new Map<string, ContextMenuItem[]>();
  for (const a of actions) {
    const key = a.set ?? '';
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key)!.push({ id: a.key, label: a.label, icon: a.icon, shortcut: a.shortcut, run: a.run });
  }
  return [...sets.entries()].map(([key, items]) => {
    const sub = SELECTION_SUBMENU_SETS[key];
    return sub ? [{ id: `set-${key}`, label: sub.label(), icon: sub.icon, submenu: [items] }] : items;
  });
}

// On selected text: a family per selection group, in its order, named as the `\` menu names it
// (objects/selectionActions.ts selectionGroups): Turn into ▸, Send to ▸, Annotate ▸, Link ▸.
registerContextMenuProvider({
  id: 'note-editor.selection',
  kind: 'note-editor',
  order: 8,
  items: (ctx, scope) => {
    const { editor } = api(scope);
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      // Nothing selected: Annotate ▸ for the whole line clicked (the user, 2026-11-06). A block's
      // own Annotate ▸ (textMarks.ts) covers a click inside a block.
      if (!editor.isEditable || ctx.target.closest('[data-note-block]')) return [];
      // A click outside the document's text (the editor's padding) has no position: nothing to annotate.
      const at = (() => { try { return editor.view.posAtDOM(ctx.target, 0); } catch { return null; } })();
      const line = at === null ? null : markRange(editor.state, at);
      const g = selectionGroup('mark');
      return line ? [{ id: g.menuId, label: g.label, icon: g.icon, submenu: bySet(annotationActions(editor, line)) }] : [];
    }
    const actions = selectionActions(editor, { from, to });
    return selectionGroups().flatMap((g): ContextMenuItem[] => {
      const of = actions.filter((a) => a.group === g.id);
      return of.length ? [{ id: g.menuId, label: g.label, icon: g.icon, submenu: bySet(of) }] : [];
    });
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

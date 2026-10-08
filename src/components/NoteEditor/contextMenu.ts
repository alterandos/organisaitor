import type { Editor } from '@tiptap/react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuScope } from '@/contextMenu/types';
import { LABELS } from '@/config/labels';
import { setNormalText } from './extensions/normalText';

// The Notes editor's right-click menu. NoteEditor declares a `note-editor` scope on the editing
// surface whose data is this API (the actions only it can perform); the providers below turn it
// into sections. Another feature adds to this menu by registering its own provider for
// `note-editor` (say, "Save tab as template"), without touching these.
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
    ];
  },
});

registerContextMenuProvider({
  id: 'note-editor.insert',
  kind: 'note-editor',
  order: 20,
  items: (_ctx, scope) => {
    const { editor, openLink, openCreate } = api(scope);
    return [
      { id: 'link', label: LABELS.contextMenu.link, icon: '🔗', shortcut: 'Ctrl+L', run: openLink },
      { id: 'create', label: LABELS.contextMenu.createFrom, icon: '🧩', shortcut: 'Ctrl+Q', disabled: editor.state.selection.empty, run: openCreate },
    ];
  },
});

registerContextMenuProvider({
  id: 'note-editor.style',
  kind: 'note-editor',
  order: 30,
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

registerContextMenuProvider({
  id: 'note-editor.select',
  kind: 'note-editor',
  order: 40,
  items: (_ctx, scope) => {
    const { editor } = api(scope);
    return [{ id: 'select-all', label: LABELS.contextMenu.selectAll, shortcut: 'Ctrl+A', run: () => { editor.chain().focus().selectAll().run(); } }];
  },
});

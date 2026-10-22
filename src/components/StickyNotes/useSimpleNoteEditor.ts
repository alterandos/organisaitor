import { useEffect, useRef } from 'react';
import { EscapePassThrough } from '@/components/NoteEditor/extensions/EscapePassThrough';
import { useEditor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { SpecialCharInput } from '@/components/NoteEditor/extensions/SpecialCharInput';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { setStickyContent, stickyDocFrom, stickyDocOf, type StickyDoc } from '@/services/stickyNotes';
import type { Note } from '@/types/notes';

const SAVE_MS = 400;

// What a simple note can hold (services/stickyNotes.ts STICKY_MARKS: paragraphs, bold, italic,
// underline, strikethrough), plus the `//name` characters every text field has. Build once per
// kind of note, at module level, so the editor isn't recreated on every render.
export function simpleNoteExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
      code: false, codeBlock: false, horizontalRule: false, link: false, dropcursor: false, gapcursor: false, trailingNode: false,
    }),
    Placeholder.configure({ placeholder }),
    SpecialCharInput,
    EscapePassThrough,
  ];
}

// A small editor over a note that holds only simple text: a sticky note, the scratchpad
// (2026-10-19, lifted out of StickyNotes so the two can't drift apart). Saves a moment after
// typing stops and on leaving the text; takes up a change made elsewhere (another device, the
// note's own editor) unless it's being written in right now. `stored` is null when the note holds
// more than simple text (shown read-only by the caller, with a way to open it); `locked` when it's
// encrypted and locked. `keepTitle`: the note keeps its name rather than taking its first line.
export function useSimpleNoteEditor(note: Note, extensions: Extensions, attributes: Record<string, string>, keepTitle = false) {
  const locked = isNoteLocked(note);
  const content = locked ? '' : noteView(note).content;
  const stored = locked ? null : stickyDocOf(content);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<StickyDoc | null>(null);
  const noteId = note.id;
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { setStickyContent(noteId, pending.current, keepTitle); pending.current = null; }
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) setStickyContent(noteId, pending.current, keepTitle);
  }, [noteId, keepTitle]);

  const editor = useEditor({
    extensions,
    content: stored ?? '',
    editorProps: { attributes },
    onUpdate: ({ editor: ed }) => {
      const doc = stickyDocFrom(ed.getJSON());
      if (!doc) return;
      pending.current = doc;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_MS);
    },
    onBlur: () => flush(),
  });

  const storedKey = stored ? JSON.stringify(stored) : null;
  useEffect(() => {
    if (!editor || editor.isDestroyed || storedKey === null || editor.isFocused || pending.current) return;
    const now = stickyDocFrom(editor.getJSON());
    if (now && JSON.stringify(now) === storedKey) return;
    editor.commands.setContent(JSON.parse(storedKey), { emitUpdate: false });
  }, [editor, storedKey]);

  return { editor, locked, stored, flush };
}

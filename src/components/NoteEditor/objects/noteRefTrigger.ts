import { LABELS } from '@/config/labels';
import { NOTE_LINK_ICON } from '@/config/itemIcons';
import type { Editor } from '@tiptap/core';
import { objectTriggerStorage } from './NoteObjectTrigger';
import type { NoteBlockKind } from './types';

// `\ref`: a link to another note or one of its passages (extensions/NoteLink.ts), the same as `[[`.
// Named "ref", not "link", so it isn't taken for a web link (Ctrl+L). It inserts no block: what was
// typed goes and the note picker opens; the target's name goes in as the linked text. In the
// block family only because that's the `\` menu's "Add to the note" group.
export const noteRefTrigger: NoteBlockKind = {
  family:  'block',
  id:      'ref',
  label:   LABELS.noteLinks.label,
  icon:    NOTE_LINK_ICON,
  aliases: ['notelink', 'wikilink', 'backlink', 'xref'],
  hint:    LABELS.noteLinks.hint,
  insert:  (view, from, to) => {
    view.dispatch(view.state.tr.delete(from, to));
    const editor = (view.dom as HTMLElement & { editor?: Editor }).editor;
    const open = editor && objectTriggerStorage(editor).openNoteLinkPicker;
    if (open) open({ purpose: 'link', from, to: from });
  },
};

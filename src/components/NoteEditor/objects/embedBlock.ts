import { LABELS } from '@/config/labels';
import { EMBED_ICON } from '@/config/itemIcons';
import type { Editor } from '@tiptap/core';
import { NoteEmbed } from '../extensions/NoteEmbed';
import { objectTriggerStorage } from './NoteObjectTrigger';
import type { NoteBlockKind } from './types';

// `\embed`: a passage from another note, as it reads now (extensions/NoteEmbed.ts). What was typed
// goes, then the note picker chooses the note and the passage; the block is put in after that.
export const embedBlock: NoteBlockKind = {
  family:  'block',
  id:      'embed',
  label:   LABELS.noteLinks.embedLabel,
  icon:    EMBED_ICON,
  aliases: ['transclude', 'include', 'passage'],
  hint:    LABELS.noteLinks.embedHint,
  insert:  (view, from, to) => {
    if (!view.state.schema.nodes[NoteEmbed.name]) return;
    view.dispatch(view.state.tr.delete(from, to));
    const editor = (view.dom as HTMLElement & { editor?: Editor }).editor;
    const open = editor && objectTriggerStorage(editor).openNoteLinkPicker;
    if (open) open({ purpose: 'embed', from, to: from });
  },
};

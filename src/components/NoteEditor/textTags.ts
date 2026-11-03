import type { Editor } from '@tiptap/core';
import type { NoteTag } from '@/types/notes';
import { TEXT_TAGS } from './builtinTags';
import { cycleImportance } from './extensions/Importance';

// The tags that can be put on text, in ONE order: the tag picker (Ctrl+Space) numbers them 1–9 and
// Ctrl+1…9 applies the same one (2026-11-03). Marking text only: cards are made with `\`.
export interface TextTagChoice {
  id: string;
  name: string;
  icon: string;
  color: string;
  typeKey: string | null;
  builtin: boolean;
}

export function textTagChoices(noteTags: Record<string, NoteTag>): TextTagChoice[] {
  return [
    ...TEXT_TAGS.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, typeKey: t.typeKey, builtin: true })),
    ...Object.values(noteTags).map((t) => ({ id: t.id, name: t.name, icon: t.icon ?? '📁', color: t.color ?? '#6b7280', typeKey: null, builtin: false })),
  ];
}

// Puts the tag on the selection, or takes it off if the selection already has it. Important goes
// through its levels (Importance.ts), so it always has its passage id.
export function applyTextTag(editor: Editor, tag: TextTagChoice): void {
  if (tag.typeKey === 'important') { cycleImportance(editor.view); return; }
  if (editor.isActive('noteTag', { tagId: tag.id })) { editor.chain().focus().unsetMark('noteTag').run(); return; }
  editor.chain().focus().setMark('noteTag', { tagId: tag.id, color: tag.color, typeKey: tag.typeKey }).run();
}

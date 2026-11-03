// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NoteTagMark } from './extensions/NoteTagMark';
import { collectImportantPassages } from './extensions/Importance';
import { applyTextTag, textTagChoices } from './textTags';
import type { NoteTag } from '@/types/notes';

let editor: Editor;
afterEach(() => editor?.destroy());

const userTag = { id: 'u1', name: 'Exam', icon: null, color: null } as unknown as NoteTag;

describe('the tags put on text (2026-11-03)', () => {
  it('are Important, Example, Reference, then the person\'s own tags: no Glossary kinds', () => {
    const names = textTagChoices({ u1: userTag }).map((t) => t.name);
    expect(names).toEqual(['Important', 'Example', 'Reference', 'Exam']);
  });

  it('Important goes through its levels, with a passage id; another tag goes on and off', () => {
    editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, NoteTagMark], content: '<p>Plants use light</p>' });
    const [important, example] = textTagChoices({});
    editor.commands.setTextSelection({ from: 1, to: 7 });
    applyTextTag(editor, important);
    expect(collectImportantPassages(editor.state.doc)[0]).toMatchObject({ level: 1, passageId: expect.any(String) });
    editor.commands.setTextSelection({ from: 8, to: 11 });
    applyTextTag(editor, example);
    expect(editor.getHTML()).toContain('data-tag-id="builtin-example"');
    applyTextTag(editor, example);
    expect(editor.getHTML()).not.toContain('builtin-example');
  });
});

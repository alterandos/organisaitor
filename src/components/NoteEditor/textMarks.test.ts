// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { noteEditorExtensions } from './noteEditorExtensions';
import { collectImportantPassages } from './extensions/Importance';
import { collectClarify } from './extensions/ClarifyMark';
import { collectFlags } from './extensions/UnsureFlag';
import { blockReview, collectReviewRuns } from './extensions/ReviewMark';
import { blockFlag } from './extensions/BlockFlags';
import { blockImportance } from './extensions/BlockImportance';
import { applyTextMark, markDigit, markForDigit, textMarks } from './textMarks';
import { selectionActions } from './objects/selectionActions';
import { useNoteStore } from '@/store/noteStore';
import type { NoteTag } from '@/types/notes';

// Marking text (agreed with the user 2026-11-05): one list of marks, statuses then tags, the same
// numbers in the picker and Ctrl+1…9; statuses go on whole blocks too; cards are Turn into.

let editor: Editor;
beforeEach(() => useNoteStore.setState(useNoteStore.getInitialState(), true));
afterEach(() => editor?.destroy());

const userTag = { id: 'u1', name: 'Exam', icon: null, color: null, kind: 'tag' } as unknown as NoteTag;
const notebook = { id: 'n1', name: 'Biology', icon: null, color: null, kind: 'area' } as unknown as NoteTag;
const make = (content: string | object) => {
  editor = new Editor({ element: document.createElement('div'), extensions: noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }), content });
};

describe('the marks', () => {
  it('are the statuses, then Example and Reference, then the person’s own tags; no Glossary kinds, no notebooks', () => {
    const marks = textMarks({ u1: userTag, n1: notebook });
    expect(marks.map((m) => [m.id, m.family])).toEqual([
      ['important', 'status'], ['clarify', 'status'], ['unsure', 'status'], ['review', 'status'],
      ['builtin-example', 'tag'], ['builtin-reference', 'tag'], ['u1', 'tag'],
    ]);
    expect(markForDigit({}, 4)?.id).toBe('review');
    expect(markDigit({ u1: userTag }, 'u1')).toBe(7);
    expect(markDigit({}, 'builtin-important')).toBe(1);
  });

  it('each status goes on and off text, and on and off a whole block', () => {
    make({ type: 'doc', content: [{ type: 'section', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Plants use photosynthesis daily' }] },
      { type: 'quoteBlock', content: [{ type: 'quoteText', content: [{ type: 'text', text: 'All models are wrong' }] }] },
    ] }] });
    const marks = textMarks({});
    const [important, clarify, unsure, review] = marks;
    editor.commands.setTextSelection({ from: 14, to: 28 });
    for (const m of [important, clarify, unsure, review]) applyTextMark(editor, m);
    const s = () => editor.state;
    expect(collectImportantPassages(s().doc)).toHaveLength(1);
    expect(collectClarify(s().doc)).toHaveLength(1);
    expect(collectFlags(s().doc)).toHaveLength(1);
    expect(collectReviewRuns(s().doc)).toHaveLength(1);
    for (const m of [clarify, unsure, review]) applyTextMark(editor, m);
    expect([collectClarify(s().doc), collectFlags(s().doc), collectReviewRuns(s().doc)].map((x) => x.length)).toEqual([0, 0, 0]);
    // Ctrl+1 again: Critical, then off
    applyTextMark(editor, important);
    expect(collectImportantPassages(s().doc)[0].level).toBe(3);

    let quote = -1;
    s().doc.descendants((n, pos) => { if (quote < 0 && n.type.name === 'quoteBlock') quote = pos; });
    for (const m of [important, clarify, unsure, review]) applyTextMark(editor, m, quote);
    expect(blockImportance(s(), quote)).toBe(1);
    expect(blockFlag(s(), quote, 'clarify')).not.toBeNull();
    expect(blockFlag(s(), quote, 'unsure')).not.toBeNull();
    expect(blockReview(s(), quote)).toMatchObject({ step: 0 });
  });

  it('a tag goes on and off text', () => {
    make('<p>Plants use light</p>');
    editor.commands.setTextSelection({ from: 8, to: 11 });
    const example = textMarks({}).find((m) => m.id === 'builtin-example')!;
    applyTextMark(editor, example);
    expect(editor.getHTML()).toContain('data-tag-id="builtin-example"');
    applyTextMark(editor, example);
    expect(editor.getHTML()).not.toContain('builtin-example');
  });

  it('on selected text, Mark as is the marks and the cards are Turn into', () => {
    make('<p>photosynthesis</p>');
    const actions = selectionActions(editor as never, { from: 2, to: 16 });
    const of = (g: string) => actions.filter((a) => a.group === g).map((a) => a.key);
    expect(of('mark')).toEqual(['important-1', 'important-3', 'clarify', 'unsure', 'review', 'tag-builtin-example', 'tag-builtin-reference']);
    expect(of('turn')).toEqual(expect.arrayContaining(['definition', 'concept', 'acronym', 'quote']));
  });
});

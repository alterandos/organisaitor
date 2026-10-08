import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { findOccurrences, selectionNeedle } from './OccurrenceHighlight';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
});
const p = (...parts: (string | [string])[]) => schema.node('paragraph', null, parts.map((t) =>
  typeof t === 'string' ? schema.text(t) : schema.text(t[0], [schema.marks.bold.create()])));
const doc = schema.node('doc', null, [
  p('Mitosis splits a cell. ', ['Mitosis'], ' again.'),
  p('Premitosis is not mitosis-like? MITOSIS is.'),
]);
const texts = (d: typeof doc, ranges: [number, number][]) => ranges.map(([a, b]) => d.textBetween(a, b));

describe('occurrence highlighting', () => {
  it('finds every whole-word mention, any case, across marks and blocks', () => {
    const found = findOccurrences(doc, 'mitosis', true);
    expect(texts(doc, found)).toEqual(['Mitosis', 'Mitosis', 'mitosis', 'MITOSIS']);   // not inside "Premitosis"
  });

  it('a selection that isn’t a whole word matches anywhere', () => {
    expect(findOccurrences(doc, 'itos', false)).toHaveLength(5);
    expect(texts(doc, findOccurrences(doc, 'cell.', true))).toEqual(['cell.']);
  });

  it('only looks for a short, single-line selection', () => {
    const at = (from: number, to: number) => selectionNeedle(EditorState.create({ doc, selection: TextSelection.create(doc, from, to) }));
    expect(at(1, 8)).toEqual({ text: 'Mitosis', wholeWord: true });
    expect(at(2, 6)).toEqual({ text: 'itos', wholeWord: false });
    expect(at(1, 2)).toBeNull();                 // one character
    expect(at(1, 1)).toBeNull();                 // a cursor
    expect(at(1, doc.child(0).nodeSize + 5)).toBeNull();  // across paragraphs
  });
});

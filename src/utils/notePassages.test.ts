import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { collectPassages, contextRanges, passageNodes, searchPassages } from './notePassages';

const schema = getSchema(noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }));
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (text: string, level = 2) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const doc = PMNode.fromJSON(schema, { type: 'doc', content: [{ type: 'section', content: [
  h('Osmosis'), p('Water moves across a membrane.'), p('It needs a gradient.'),
  h('Diffusion'), p('Particles spread out.'),
  { type: 'image', attrs: { pictureId: 'pic1', alt: 'Cell membrane' } },
] }] });
const at = { noteId: 'n1', tabId: null, noteTitle: 'Lectures', notebooks: ['Biology'], tabName: null };

describe('Look up: passages of the notes', () => {
  it('collects headings, paragraphs and pictures', () => {
    const ps = collectPassages(doc, at);
    expect(ps.map((x) => [x.kind, x.text])).toEqual([
      ['heading', 'Osmosis'], ['text', 'Water moves across a membrane.'], ['text', 'It needs a gradient.'],
      ['heading', 'Diffusion'], ['text', 'Particles spread out.'], ['picture', 'Cell membrane'],
    ]);
  });

  it('finds passages with every word typed, in the passage or its note title, the passage itself first', () => {
    const ps = collectPassages(doc, at);
    expect(searchPassages(ps, 'membrane').map((x) => x.kind)).toEqual(['picture', 'text']);
    expect(searchPassages(ps, 'osmosis').map((x) => x.text)).toEqual(['Osmosis']);
    expect(searchPassages(ps, 'biology gradient').map((x) => x.text)).toEqual(['It needs a gradient.']);
    expect(searchPassages(ps, 'nothing like this')).toEqual([]);
    expect(searchPassages(ps, '  ')).toEqual([]);
  });

  it('a heading reads with its section', () => {
    const osmosis = collectPassages(doc, at)[0];
    expect(passageNodes(doc, osmosis.pos).map((n) => n.textContent)).toEqual(['Osmosis', 'Water moves across a membrane.', 'It needs a gradient.']);
  });

  it('marks the passage, and everything around it as context (greyed in the preview)', () => {
    const ps = collectPassages(doc, at);
    const text = (r: [number, number][]) => r.map(([f, t]) => doc.textBetween(f, t, ' '));
    const water = contextRanges(doc, ps[1]);
    expect(text(water.passage)).toEqual(['Water moves across a membrane.']);
    expect(text(water.context)).toEqual(['Osmosis', 'It needs a gradient.', 'Diffusion', 'Particles spread out.', '']);
    const section = contextRanges(doc, ps[0]);
    expect(text(section.passage)).toEqual(['Osmosis', 'Water moves across a membrane.', 'It needs a gradient.']);
  });

  it('a Glossary term whose name is what was typed comes first; its acronym and meaning are found too', () => {
    const term = { ...at, pos: 0, kind: 'term' as const, text: 'Osmosis', pictureId: null, term: { entryId: 'e1', typeKey: 'definition', icon: '📖', names: ['OSM'], meaning: 'water across a membrane' } };
    const ps = [...collectPassages(doc, at), term];
    expect(searchPassages(ps, 'osmosis')[0]).toBe(term);
    expect(searchPassages(ps, 'osm')[0]).toBe(term);
    expect(searchPassages(ps, 'membrane')).toContain(term);
  });
});

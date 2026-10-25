import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { BLOCK_EXAMPLES, BLOCK_GUIDE_NEEDS, GUIDE_BLOCKS, exampleDoc, guideMatches } from './guideData';

// The block guide's data (guideData.ts): every block is in it, with an example (or what it needs),
// and every example reads with the note editor's own schema in each of its designs.

describe('the block guide', () => {
  it('every note block is in the guide, and each has an example or says what it needs', () => {
    const inGuide = new Set(GUIDE_BLOCKS.map((b) => b.node));
    const missing = [...NOTE_BLOCK_NODES].filter((n) => !inGuide.has(n));
    expect(missing).toEqual([]);
    const bare = GUIDE_BLOCKS.filter((b) => !BLOCK_EXAMPLES[b.node] && !BLOCK_GUIDE_NEEDS[b.node]).map((b) => b.kind.id);
    expect(bare).toEqual([]);
  });

  it('each example reads with the note editor’s schema, in every design', () => {
    const schema = getSchema(noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }));
    for (const b of GUIDE_BLOCKS) {
      if (!BLOCK_EXAMPLES[b.node]) continue;
      for (const d of b.designs.length ? b.designs.map((x) => x.id) : [null]) {
        const doc = schema.nodeFromJSON(exampleDoc(b.node, d)!);
        expect(() => doc.check(), `${b.kind.id} ${d}`).not.toThrow();
        let variant: unknown;
        doc.descendants((n) => { if (n.type.name === b.node) variant = n.attrs.variant; });
        if (d) expect(variant, `${b.kind.id} ${d}`).toBe(d);
      }
    }
  });

  it('search finds a block by name, keyword (with or without its backslash), other keyword or use', () => {
    const find = (q: string) => GUIDE_BLOCKS.filter((b) => guideMatches(b, q)).map((b) => b.kind.id);
    expect(find('venn')).toContain('venn');
    expect(find('\\tl')).toContain('timeline');
    expect(find('\\venn')).toEqual(['venn']);
    expect(find('overlap')).toContain('venn');
  });
});

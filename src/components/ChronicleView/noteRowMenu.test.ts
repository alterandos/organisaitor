// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveContextMenu } from '@/contextMenu/registry';
import type { ContextMenuContext } from '@/contextMenu/types';
import './noteRowMenu';

// A note's right-click (2026-11-03): opening, then the note's own settings, then Delete apart;
// not a section per feature.

const menuFor = (data: object) => {
  const ctx: ContextMenuContext = { section: 'notes', target: document.body, x: 0, y: 0, selectionText: '', scopes: [{ kind: 'note-row', data }] };
  return resolveContextMenu(ctx).map((s) => s.map((i) => i.id));
};

describe("a note's right-click menu", () => {
  it('in the notes list: Open, Open beside / the note / Delete', () => {
    const sections = menuFor({ noteId: 'n1', indent: () => {}, delete: () => {} });
    expect(sections[0]).toEqual(['open', 'open-beside']);
    expect(sections[1].slice(0, 3)).toEqual(['details', 'indent', 'note-colour']);
    expect(sections[1]).toContain('quick-access-pin');
    expect(sections[sections.length - 1]).toEqual(['delete']);
    expect(sections).toHaveLength(3);
  });

  it('a Mosaic card (nothing the list alone does): no Delete or indenting', () => {
    const sections = menuFor({ noteId: 'n1' });
    expect(sections.flat()).not.toContain('delete');
    expect(sections.flat()).not.toContain('indent');
    expect(sections).toHaveLength(2);
  });
});

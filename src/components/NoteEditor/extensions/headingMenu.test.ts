// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SectionDocument, Section, ColumnBlock, Column } from './Section';
import { HeadingFold, toggleHeadingFold } from './HeadingFold';
import { resolveContextMenu } from '@/contextMenu/registry';
import type { ContextMenuContext, ContextMenuSection } from '@/contextMenu/types';
import { useSettingsStore } from '@/store/settingsStore';
import '../contextMenu';
import './headingMenu';

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
afterEach(() => editor?.destroy());

function make(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ document: false }), SectionDocument, Section, ColumnBlock, Column, HeadingFold],
    content,
  });
}

function menuAt(target: Element): ContextMenuSection[] {
  const ctx: ContextMenuContext = {
    section: 'notes', target, x: 0, y: 0, selectionText: '',
    scopes: [{ kind: 'note-editor', data: { editor, paste: async () => {}, openLink: () => {}, openCreate: () => {}, insertTitle: () => {} } }],
  };
  return resolveContextMenu(ctx);
}

const ids = (sections: ContextMenuSection[]) => sections.flat().map((i) => i.id);
const headingsFamily = (sections: ContextMenuSection[]) => sections.flat().find((i) => i.id === 'headings');
// How many submenus deep a menu goes (CLAUDE.md "Right-click menus": at most two).
const depth = (sections: ContextMenuSection[]): number =>
  Math.max(0, ...sections.flat().map((i) => (i.submenu ? 1 + depth(i.submenu) : 0)));

describe('right-click on a heading', () => {
  it('offers collapsing that heading first, and the Headings family', () => {
    make('<h1>One</h1><p>a</p>');
    const menu = menuAt(editor.view.dom.querySelector('h1')!);
    expect(ids(menu)[0]).toBe('heading-fold');
    expect(headingsFamily(menu)).toBeDefined();
    expect(depth(menu)).toBeLessThanOrEqual(2);
  });

  it('says Expand on a collapsed heading; Expand all shows only when something is collapsed', () => {
    make('<h1>One</h1><p>a</p>');
    const family = () => headingsFamily(menuAt(editor.view.dom.querySelector('p') ?? editor.view.dom))!.submenu!.flat().map((i) => i.id);
    expect(family()).not.toContain('expand-all');
    toggleHeadingFold(editor.view, 1);
    const top = menuAt(editor.view.dom.querySelector('h1')!).flat()[0];
    expect(top.label).toMatch(/Expand/);
    expect(family()).toContain('expand-all');
  });

  it('a paragraph gets no heading item; a note without headings no Headings family', () => {
    make('<h1>One</h1><p>a</p>');
    expect(ids(menuAt(editor.view.dom.querySelector('p')!))).not.toContain('heading-fold');
    make('<p>plain</p>');
    expect(headingsFamily(menuAt(editor.view.dom.querySelector('p')!))).toBeUndefined();
  });

  it('Sticky headings is ticked when on and toggles the setting', () => {
    make('<h1>One</h1><p>a</p>');
    useSettingsStore.setState({ stickyHeadings: true });
    const sticky = () => headingsFamily(menuAt(editor.view.dom.querySelector('p')!))!.submenu!.flat().find((i) => i.id === 'sticky')!;
    expect(sticky().icon).toBe('✓');
    void sticky().run!();
    expect(useSettingsStore.getState().stickyHeadings).toBe(false);
    expect(sticky().icon).toBeUndefined();
  });
});

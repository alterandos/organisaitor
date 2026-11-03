// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { act } from '@testing-library/react';
import { noteEditorExtensions } from '../noteEditorExtensions';
import { EX } from '@/demo/blockExamples';
import { kids, node, p, type J } from '@/demo/noteContent';
import { addPartBeside, canAddPart, groupNames, movePartToSlot, otherGroups, canDeletePart, canDuplicatePart, canMovePart, deleteBlockPart, duplicatePart, movePart, movePartTo, partAround, unitsOf, PART_SPECS } from './blockParts';
import { BLOCK_PART_NODES } from '../blockNodes';
import { deletePicked, partAt, picksOf, togglePick } from './blockPicks';

vi.mock('@/components/ConfirmDialog/dialogs', async (orig) => ({ ...(await orig<typeof import('@/components/ConfirmDialog/dialogs')>()), alertDialog: vi.fn(async () => {}) }));

const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

let editor: Editor;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
afterEach(async () => { await flush(); editor?.destroy(); await flush(); });

function make(...blocks: J[]) {
  editor = new Editor({
    extensions: noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }),
    content: { type: 'doc', content: [kids('section', { columns: 1, locked: false }, [p('before'), ...blocks, p('after')])] },
  });
}

// Each node of a type, with its position, in document order.
const all = (type: string) => {
  const out: { pos: number; node: PMNode }[] = [];
  editor.state.doc.descendants((n, pos) => { if (n.type.name === type) out.push({ pos, node: n }); });
  return out;
};
const texts = (type: string) => all(type).map(({ node: n }) => n.textContent);
const partOf = (type: string, i: number) => partAround(editor.state.doc, all(type)[i].pos)!;
const cursorIn = (type: string, i: number) => {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(all(type)[i].pos + 2))));
};
const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
  editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })));

describe('the part handle: moving a part', () => {
  it('moves a cycle stage down and back up, and Alt+↑/↓ do the same with the cursor in it', () => {
    make(EX.cycle());
    const first = texts('cycleLabel');
    expect(movePart(editor.view, partOf('cycleStage', 0), 1)).toBe(true);
    expect(texts('cycleLabel').slice(0, 2)).toEqual([first[1], first[0]]);
    cursorIn('cycleStage', 1);
    press('ArrowUp', { altKey: true });
    expect(texts('cycleLabel')).toEqual(first);
    // The cursor went with the stage.
    expect(partAround(editor.state.doc, editor.state.selection.from)?.node.textContent).toBe(all('cycleStage')[0].node.textContent);
  });

  it('a hierarchy item moves with everything under it, among the items at its level', () => {
    make(EX.hierarchy());
    const cenozoic = texts('hierarchyItem').indexOf('Cenozoic');
    const at = partOf('hierarchyItem', cenozoic);
    expect(unitsOf(at).units).toHaveLength(3);        // the three eras
    movePart(editor.view, at, 1);
    expect(texts('hierarchyItem')).toEqual([
      'Phanerozoic: the last 541 million years', 'Mesozoic', 'Cretaceous', 'Jurassic',
      'Cenozoic', 'Quaternary', 'Neogene', 'Paleozoic', 'Permian', 'Cambrian',
    ]);
    // The top item has nowhere to go.
    expect(canMovePart(partOf('hierarchyItem', 0))).toBe(false);
  });

  it('a comparison\'s point moves among its own side\'s points; a side moves among the sides', () => {
    make(EX.compareBlock());
    const point = partOf('comparePoint', 0);
    expect(point.node.type.name).toBe('comparePoint');
    expect(unitsOf(point).units).toHaveLength(3);
    movePartTo(editor.view, point, 2);
    expect(texts('comparePoint').slice(0, 3)).toEqual(['In acid: no reaction', 'Breaks: conchoidal fracture, no cleavage', 'Hardness: 7, scratches glass']);
    movePart(editor.view, partOf('compareSide', 0), 1);
    expect(texts('compareTitle')).toEqual(['Calcite', 'Quartz']);
  });

  it('a timeline in date order can\'t be put in another order by hand; in Manual order it can', () => {
    make(EX.timeline());
    expect(canMovePart(partOf('timelineItem', 0))).toBe(false);
    cursorIn('timelineItem', 0);
    expect(press('ArrowDown', { altKey: true })).toBeFalsy();
    editor.destroy();
    make({ ...EX.timeline(), attrs: { variant: 'rail', order: 'manual' } });
    expect(canMovePart(partOf('timelineItem', 0))).toBe(true);
  });
});

describe('the part handle: duplicating and deleting', () => {
  it('duplicates a step after itself, without its lasting id', () => {
    make(EX.steps());
    const before = texts('stepsLabel');
    const step = all('stepsStep')[1];
    editor.view.dispatch(editor.state.tr.setNodeMarkup(step.pos, undefined, { ...step.node.attrs, blockId: 'kept-once' }));
    expect(duplicatePart(editor.view, partOf('stepsStep', 1))).toBe(true);
    expect(texts('stepsLabel')).toEqual([...before.slice(0, 2), before[1], ...before.slice(2)]);
    expect(all('stepsStep').filter(({ node: n }) => n.attrs.blockId === 'kept-once')).toHaveLength(1);
  });

  it('Alt+Shift+↓ duplicates the part with the cursor in it, and the line anywhere else', () => {
    make(EX.conclusion());
    const reasons = all('conclusionReason').length;
    cursorIn('conclusionReason', 0);
    press('ArrowDown', { altKey: true, shiftKey: true });
    expect(all('conclusionReason')).toHaveLength(reasons + 1);
    const paragraphs = all('paragraph').length;
    editor.commands.setTextSelection(3);    // in "before"
    press('ArrowDown', { altKey: true, shiftKey: true });
    expect(all('paragraph')).toHaveLength(paragraphs + 1);
  });

  it('deletes a filled part in one go; never leaves fewer than the block allows', () => {
    make(EX.conclusion());
    const reasons = texts('conclusionReason');
    cursorIn('conclusionReason', 0);
    press('Backspace', { ctrlKey: true, shiftKey: true });
    expect(texts('conclusionReason')).toEqual(reasons.slice(1));
    editor.destroy();
    make(EX.breakdown());
    deleteBlockPart(editor.view, partOf('breakdownPart', 0));
    expect(all('breakdownPart')).toHaveLength(2);
    expect(canDeletePart(partOf('breakdownPart', 0))).toBe(false);   // a breakdown keeps two
  });

  it('an inbox item or a hub link keeps its own order and can\'t be copied', () => {
    const inbox = kids('inbox', { inboxId: 't-inbox', variant: 'list', order: 'newest' }, [
      node('inboxTitle', null, 'Ideas'),
      ...['One', 'Two'].map((t, i) => kids('inboxItem', { itemId: `t-${i}`, status: 'idea', sentAt: null, fromNote: null, fromTab: null, taskId: null }, [p(t)])),
    ]);
    make(inbox);
    const at = partOf('inboxItem', 0);
    expect(canMovePart(at)).toBe(false);
    expect(canDuplicatePart(at)).toBe(false);
  });
});

describe('the part handle covers every block with parts', () => {
  it('every part type Ctrl+click picks is also a part the handle moves and deletes', () => {
    const missing = [...new Set(Object.values(BLOCK_PART_NODES))]
      .filter((t) => !['quoteField', 'questionField', 'caseField'].includes(t))   // fields: shown or hidden, not parts in a list
      .filter((t) => !PART_SPECS[t]);
    expect(missing).toEqual([]);
  });
});

describe('the part handle: adding a part beside one', () => {
  it('adds an empty stage before or after the one clicked, the cursor in it', () => {
    make(EX.cycle());
    const first = texts('cycleLabel');
    expect(addPartBeside(editor.view, partOf('cycleStage', 1), 'after')).toBe(true);
    expect(texts('cycleLabel')).toEqual([first[0], first[1], '', ...first.slice(2)]);
    expect(partAround(editor.state.doc, editor.state.selection.from)?.pos).toBe(all('cycleStage')[2].pos);
    addPartBeside(editor.view, partOf('cycleStage', 0), 'before');
    expect(texts('cycleLabel')[0]).toBe('');
  });

  it('a new hierarchy item takes the level of the one beside it, and goes after everything under it', () => {
    make(EX.hierarchy());
    const cenozoic = texts('hierarchyItem').indexOf('Cenozoic');
    addPartBeside(editor.view, partOf('hierarchyItem', cenozoic), 'after');
    const items = all('hierarchyItem').map(({ node: n }) => [n.textContent, n.attrs.level]);
    expect(items.slice(1, 6)).toEqual([['Cenozoic', 1], ['Quaternary', 2], ['Neogene', 2], ['', 1], ['Mesozoic', 1]]);
  });

  it('a comparison point gets a new point in its own side; an inbox item gets none', () => {
    make(EX.compareBlock());
    const before = all('comparePoint').length;
    addPartBeside(editor.view, partOf('comparePoint', 0), 'after');
    expect(all('compareSide')[0].node.childCount).toBe(5);    // its title and four points
    expect(all('comparePoint')).toHaveLength(before + 1);
    editor.destroy();
    make(kids('inbox', { inboxId: 't-inbox', variant: 'list', order: 'newest' }, [
      node('inboxTitle', null, 'Ideas'),
      kids('inboxItem', { itemId: 't-0', status: 'idea', sentAt: null, fromNote: null, fromTab: null, taskId: null }, [p('One')]),
    ]));
    expect(canAddPart(partOf('inboxItem', 0))).toBe(false);
  });
});

describe('Ctrl+click picks parts that sit inside a block’s lists and columns', () => {
  const pick = (type: string, i: number) => togglePick(editor.view, partAt(editor.state.doc, all(type)[i].pos + 1)!);

  it('picks pros-and-cons points and deletes them together', () => {
    make(EX.prosCons());
    const points = texts('prosConsPoint');
    expect(partAt(editor.state.doc, all('prosConsPoint')[0].pos + 1)).not.toBeNull();
    pick('prosConsPoint', 0);
    pick('prosConsPoint', points.length - 1);
    expect(picksOf(editor.state).parts).toHaveLength(2);
    expect(deletePicked(editor.view)).toBe(true);
    expect(texts('prosConsPoint')).toEqual(points.slice(1, -1));
  });

  it('refuses to empty one list while other points remain; picking every point deletes the block', () => {
    make(EX.prosCons());
    const pros = all('prosConsList')[0].node.childCount;
    for (let i = 0; i < pros; i++) pick('prosConsPoint', i);
    expect(deletePicked(editor.view)).toBe(false);
    expect(all('prosCons')).toHaveLength(1);
    const n = all('prosConsPoint').length;
    for (let i = pros; i < n; i++) pick('prosConsPoint', i);
    expect(deletePicked(editor.view)).toBe(true);
    expect(all('prosCons')).toHaveLength(0);
  });

  it('picks a cause-and-effect item inside its column', () => {
    make(EX.causeEffect());
    const items = texts('ceItem');
    pick('ceItem', 0);
    expect(deletePicked(editor.view)).toBe(true);
    expect(texts('ceItem')).toEqual(items.slice(1));
  });
});

describe('the part handle: moving a part to another group', () => {
  const pointsOf = (list: number) => childTexts(all('prosConsList')[list].node);
  const childTexts = (n: PMNode) => { const out: string[] = []; n.forEach((c) => out.push(c.textContent)); return out; };

  it('moves a pro to the cons, and names the groups by their side', () => {
    make(EX.prosCons());
    const at = partOf('prosConsPoint', 0);
    const groups = otherGroups(at);
    expect(groupNames(editor.state.doc, at, groups)).toEqual(['Cons']);
    const cons = pointsOf(1);
    expect(movePartToSlot(editor.view, at, groups[0].pos, 1)).toBe(true);
    expect(pointsOf(0)).toEqual(['Cheap compared with cutting emissions']);
    expect(pointsOf(1)).toEqual([cons[0], 'Fast: cooling within a year or two', ...cons.slice(1)]);
  });

  it('the last pro can’t leave its list (the block needs one)', () => {
    make(EX.prosCons());
    const cons = () => all('prosConsList')[1];
    movePartToSlot(editor.view, partOf('prosConsPoint', 0), cons().pos, 0);
    expect(movePartToSlot(editor.view, partOf('prosConsPoint', 0), cons().pos, 0)).toBe(false);
    expect(pointsOf(0)).toHaveLength(1);
  });

  it('a comparison point moves to the other side; columns with the same heading get their number', () => {
    make(EX.compareBlock());
    const at = partOf('comparePoint', 0);
    expect(groupNames(editor.state.doc, at, otherGroups(at))).toEqual(['Calcite']);
    movePartToSlot(editor.view, at, otherGroups(at)[0].pos, all('compareSide')[1].node.childCount);
    expect(childTexts(all('compareSide')[1].node).at(-1)).toBe('Hardness: 7, scratches glass');
    editor.destroy();
    make(EX.causeEffect());
    const item = partOf('ceItem', 0);
    expect(groupNames(editor.state.doc, item, otherGroups(item))).toEqual(['Effects', 'Then (3)', 'Then (4)', 'Then (5)']);
  });

  it('a part right in its block has no other group', () => {
    make(EX.cycle());
    expect(otherGroups(partOf('cycleStage', 0))).toEqual([]);
  });
});

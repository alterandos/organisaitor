import { Extension } from '@tiptap/core';
import { AllSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import { createDisclosureIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';

// Collapsing a heading hides what's under it — everything up to the next heading of the same or a
// higher level, within the heading's own section or column — the way Jupyter, Word and Notion fold.
// Whether a heading is collapsed is stored on the heading (`collapsed`), so it survives a reload,
// syncs and is encrypted with the note; changing it is kept out of undo. Hidden text is never out
// of reach: when the cursor lands in it (Find, a passage jump, the outline, undo) the headings
// hiding it open again. The arrow keys step over a collapsed heading's text instead.

export interface HeadingFoldInfo {
  pos:       number;   // the heading
  level:     number;
  collapsed: boolean;
  bodyFrom:  number;   // what it folds: [bodyFrom, bodyTo); empty when bodyFrom === bodyTo
  bodyTo:    number;
}

export function computeHeadingFolds(doc: PMNode): HeadingFoldInfo[] {
  const out: HeadingFoldInfo[] = [];
  const walk = (node: PMNode, start: number) => {
    const kids: { child: PMNode; pos: number }[] = [];
    node.forEach((child, offset) => kids.push({ child, pos: start + offset }));
    kids.forEach(({ child, pos }, i) => {
      if (child.type.name === 'heading') {
        const level = child.attrs.level as number;
        let j = i + 1;
        while (j < kids.length && !(kids[j].child.type.name === 'heading' && (kids[j].child.attrs.level as number) <= level)) j++;
        out.push({
          pos, level, collapsed: !!child.attrs.collapsed,
          bodyFrom: pos + child.nodeSize,
          bodyTo:   j < kids.length ? kids[j].pos : start + node.content.size,
        });
      } else if (!child.isTextblock && !child.isAtom && child.childCount > 0) {
        walk(child, pos + 1);
      }
    });
  };
  walk(doc, 0);
  return out;
}

const hasBody = (f: HeadingFoldInfo) => f.bodyTo > f.bodyFrom;
const hides = (f: HeadingFoldInfo, from: number, to: number) =>
  f.collapsed && hasBody(f) && ((from >= f.bodyFrom && from < f.bodyTo) || (to > f.bodyFrom && to <= f.bodyTo));

// The collapsed headings hiding [from, to], outermost first.
export function foldsHiding(folds: HeadingFoldInfo[], from: number, to = from): HeadingFoldInfo[] {
  return folds.filter((f) => hides(f, from, to));
}

export const headingFoldKey = new PluginKey<{ folds: HeadingFoldInfo[]; decos: DecorationSet }>('headingFold');

const foldsOf = (state: EditorState) => headingFoldKey.getState(state)?.folds ?? computeHeadingFolds(state.doc);

function setCollapsed(tr: Transaction, pos: number, collapsed: boolean) {
  const node = tr.doc.nodeAt(pos);
  if (node?.type.name === 'heading' && !!node.attrs.collapsed !== collapsed) tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed });
}

// Collapsing around the cursor would hide it (and the auto-open below would undo the collapse at
// once): move it to the end of the visible heading that now hides it.
function keepSelectionVisible(tr: Transaction) {
  const [outer] = foldsHiding(computeHeadingFolds(tr.doc), tr.selection.from, tr.selection.to);
  if (outer) tr.setSelection(TextSelection.create(tr.doc, outer.bodyFrom - 1));
}

function dispatchFold(view: EditorView, build: (tr: Transaction) => void) {
  const tr = view.state.tr;
  build(tr);
  if (!tr.docChanged) return;
  keepSelectionVisible(tr);
  view.dispatch(tr.setMeta('addToHistory', false).setMeta(headingFoldKey, true));
}

export function toggleHeadingFold(view: EditorView, pos: number): void {
  const fold = foldsOf(view.state).find((f) => f.pos === pos);
  if (!fold || (!fold.collapsed && !hasBody(fold))) return;
  dispatchFold(view, (tr) => setCollapsed(tr, pos, !fold.collapsed));
}

// null = expand every heading; n = show headings down to level n (deeper ones and text under a
// level-n heading are folded away). "Collapse all" is level 1.
export function setHeadingFoldLevel(view: EditorView, level: number | null): void {
  dispatchFold(view, (tr) => {
    for (const f of foldsOf(view.state)) {
      if (level === null) setCollapsed(tr, f.pos, false);
      else if (hasBody(f)) setCollapsed(tr, f.pos, f.level >= level);
    }
  });
}

// Ctrl+. on a heading: collapse or expand it. Returns false off a heading (Ctrl+. is the bullet
// list there); on a heading with nothing under it, takes the key and does nothing.
export function toggleHeadingFoldAtCursor(view: EditorView): boolean {
  const { $from } = view.state.selection;
  if ($from.parent.type.name !== 'heading') return false;
  toggleHeadingFold(view, $from.before());
  return true;
}

// The heading a DOM element sits in (for the right-click menu), or null.
export function headingPosAt(view: EditorView, target: Element): number | null {
  const el = target.closest('h1, h2, h3, h4, h5');
  if (!el || !view.dom.contains(el)) return null;
  try {
    const $p = view.state.doc.resolve(view.posAtDOM(el, 0));
    return $p.parent.type.name === 'heading' ? $p.before() : null;
  } catch { return null; } // not part of the document view
}

export function headingFoldSummary(state: EditorState) {
  const folds = foldsOf(state);
  return {
    hasHeadings:  folds.length > 0,
    anyCollapsed: folds.some((f) => f.collapsed && hasBody(f)),
    foldAt:       (pos: number) => folds.find((f) => f.pos === pos) ?? null,
    canFold:      (f: HeadingFoldInfo) => f.collapsed || hasBody(f),
  };
}

function buildDecorations(doc: PMNode, folds: HeadingFoldInfo[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const f of folds) {
    if (!hasBody(f) && !f.collapsed) continue;
    const closed = f.collapsed && hasBody(f);
    decos.push(Decoration.widget(f.pos + 1, (view, getPos) => foldToggle(view, getPos, closed), {
      side: -1, key: `heading-fold-${closed ? 'closed' : 'open'}`, ignoreSelection: true, stopEvent: () => true,
    }));
    if (!closed) continue;
    decos.push(Decoration.node(f.pos, f.bodyFrom, { 'data-folded': '' }));
    decos.push(Decoration.widget(f.bodyFrom - 1, (view, getPos) => foldMore(view, getPos), {
      side: 1, key: 'heading-fold-more', ignoreSelection: true, stopEvent: () => true,
    }));
    doc.nodesBetween(f.bodyFrom, f.bodyTo, (node, pos) => {
      if (pos >= f.bodyFrom && pos + node.nodeSize <= f.bodyTo) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-fold-hidden': '' }));
        return false;
      }
      return true;
    });
  }
  return DecorationSet.create(doc, decos);
}

// The arrow in the margin before a heading. Its press is kept from the editor (no caret move, no
// focus); the click toggles, so a tap works the same on touch.
function foldToggle(view: EditorView, getPos: () => number | undefined, closed: boolean): HTMLElement {
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.setAttribute('data-heading-fold', '');
  el.setAttribute('role', 'button');
  const label = closed ? LABELS.noteHeadings.expand : LABELS.noteHeadings.collapse;
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-expanded', String(!closed));
  el.title = `${label} (Ctrl+.)`;
  el.appendChild(createDisclosureIcon(!closed));
  el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos();
    if (pos === undefined) return;
    toggleHeadingFold(view, view.state.doc.resolve(pos).before());
  });
  return el;
}

// The ⋯ after a collapsed heading's text: what it hides, and a click opens it.
function foldMore(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.setAttribute('data-heading-fold-more', '');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', LABELS.noteHeadings.expand);
  el.title = `${LABELS.noteHeadings.expand} (Ctrl+.)`;
  el.textContent = '⋯';
  el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos();
    if (pos === undefined) return;
    toggleHeadingFold(view, view.state.doc.resolve(pos).before());
  });
  return el;
}

// setContent (opening a note or a tab) replaces the whole document: never open folds for that.
const replacesWholeDoc = (tr: Transaction) =>
  tr.steps.some((s) => s instanceof ReplaceStep && s.from === 0 && s.to === tr.before.content.size);

// Arrow keys step over hidden text instead of landing in it (which would open it).
function skipHidden(view: EditorView, dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const { state } = view;
  const sel = state.selection;
  if (!sel.empty || !(sel instanceof TextSelection) || !view.endOfTextblock(dir)) return false;
  const $head = sel.$head;
  if ($head.depth === 0) return false;
  const forward = dir === 'down' || dir === 'right';
  const folds = foldsOf(state);
  const next = Selection.findFrom(state.doc.resolve(forward ? $head.after() : $head.before()), forward ? 1 : -1, true);
  if (!next) return false;
  const [outer] = foldsHiding(folds, next.from, next.to);
  if (!outer) return false;
  const target = forward
    ? Selection.findFrom(state.doc.resolve(outer.bodyTo), 1, true)
    : TextSelection.create(state.doc, outer.bodyFrom - 1);
  if (!target) return true;
  view.dispatch(state.tr.setSelection(target).scrollIntoView());
  return true;
}

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addGlobalAttributes() {
    return [{
      types: ['heading'],
      attributes: {
        collapsed: {
          default: false,
          parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
          renderHTML: (attrs) => (attrs.collapsed ? { 'data-collapsed': 'true' } : {}),
        },
      },
    }];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingFoldKey,
        state: {
          init: (_, state) => {
            const folds = computeHeadingFolds(state.doc);
            return { folds, decos: buildDecorations(state.doc, folds) };
          },
          apply: (tr, prev) => {
            if (!tr.docChanged) return prev;
            const folds = computeHeadingFolds(tr.doc);
            return { folds, decos: buildDecorations(tr.doc, folds) };
          },
        },
        props: {
          decorations: (state) => headingFoldKey.getState(state)?.decos,
          handleKeyDown: (view, event) => {
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
            const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[event.key as 'ArrowUp'];
            return dir ? skipHidden(view, dir) : false;
          },
        },
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          if (trs.some((tr) => tr.getMeta(headingFoldKey) || replacesWholeDoc(tr))) return null;
          const folds = foldsOf(state);
          const tr = state.tr;
          // A collapsed heading left with nothing under it (splitting one copies `collapsed` to
          // both halves) opens, so text added below it later isn't hidden as it's typed.
          if (trs.some((t) => t.docChanged)) for (const f of folds) if (f.collapsed && !hasBody(f)) setCollapsed(tr, f.pos, false);
          if (!(state.selection instanceof AllSelection)) {
            for (const f of foldsHiding(folds, state.selection.from, state.selection.to)) setCollapsed(tr, f.pos, false);
          }
          return tr.docChanged ? tr.setMeta('addToHistory', false).setMeta(headingFoldKey, true) : null;
        },
      }),
    ];
  },
});

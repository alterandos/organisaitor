import { Extension } from '@tiptap/core';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import styles from '../NoteEditor.module.css';
import type { BlockDesign } from './blockDesigns';
import { BREAKDOWN_DESIGNS } from './Breakdown';
import { CHART_DESIGNS } from './Chart';
import { CODE_DESIGNS } from './CodeBlock';
import { COMPARE_DESIGNS } from './Compare';
import { CONCLUSION_DESIGNS } from './Conclusion';
import { CYCLE_DESIGNS } from './Cycle';
import { DIAGRAM_DESIGNS } from './Diagram';
import { GLOSSARY_CARD_DESIGNS } from './GlossaryCard';
import { chipToCard } from './GlossaryChip';
import { HIERARCHY_DESIGNS } from './Hierarchy';
import { HUB_DESIGNS } from './Hub';
import { IDKEY_DESIGNS } from './IdKey';
import { INBOX_DESIGNS } from './Inbox';
import { MATH_DESIGNS } from './Maths';
import { EMBED_DESIGNS } from './NoteEmbed';
import { PYRAMID_DESIGNS } from './Pyramid';
import { QUESTION_DESIGNS } from './Question';
import { QUOTE_DESIGNS } from './Quote';
import { TIMELINE_DESIGNS } from './Timeline';
import { TYPES_DESIGNS } from './Types';
import { PROSCONS_DESIGNS } from './ProsCons';
import { ARGUMENT_DESIGNS } from './Argument';
import { OPTIONS_DESIGNS } from './Options';
import { CONVERT_DESIGNS } from './Convert';
import { CASE_DESIGNS } from './CaseStudy';
import { CE_DESIGNS } from './CauseEffect';
import { VENN_DESIGNS } from './Venn';

// Ctrl+] / Ctrl+[ (asked for 2026-10-15): the next / previous design of the note block the cursor
// is in (or the block that's selected), wrapping round, the new design's name shown beside it for
// a moment. Every block keeps its design in its `variant` attribute (CLAUDE.md "Block designs"),
// so one command serves them all; THE map of each block's designs is below, and a pattern test
// checks every block with designs is in it.

export const BLOCK_DESIGN_LISTS: Record<string, readonly BlockDesign<string>[]> = {
  timeline:      TIMELINE_DESIGNS,
  quoteBlock:    QUOTE_DESIGNS,
  conclusion:    CONCLUSION_DESIGNS,
  types:         TYPES_DESIGNS,
  idKey:         IDKEY_DESIGNS,
  cycle:         CYCLE_DESIGNS,
  breakdown:     BREAKDOWN_DESIGNS,
  hierarchy:     HIERARCHY_DESIGNS,
  pyramid:       PYRAMID_DESIGNS,
  chart:         CHART_DESIGNS,
  codeBlock:     CODE_DESIGNS,
  mathBlock:     MATH_DESIGNS,
  inbox:         INBOX_DESIGNS,
  glossaryCard:  GLOSSARY_CARD_DESIGNS,
  questionBlock: QUESTION_DESIGNS,
  compareBlock:  COMPARE_DESIGNS,
  prosCons:      PROSCONS_DESIGNS,
  argument:      ARGUMENT_DESIGNS,
  options:       OPTIONS_DESIGNS,
  diagram:       DIAGRAM_DESIGNS,
  hub:           HUB_DESIGNS,
  noteEmbed:     EMBED_DESIGNS,
  convertBlock:  CONVERT_DESIGNS,
  caseStudy:     CASE_DESIGNS,
  causeEffect:   CE_DESIGNS,
  vennBlock:     VENN_DESIGNS,
};

// The block the command acts on: the selected block, else the innermost block around the cursor.
export function blockForDesign(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && BLOCK_DESIGN_LISTS[sel.node.type.name]) return { node: sel.node, pos: sel.from };
  const $from = sel.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (BLOCK_DESIGN_LISTS[node.type.name]) return { node, pos: $from.before(d) };
  }
  return null;
}

// The design `dir` steps from the current one, wrapping round; null when the block has one design.
export function nextDesign(node: PMNode, dir: 1 | -1): BlockDesign<string> | null {
  const designs = BLOCK_DESIGN_LISTS[node.type.name];
  if (!designs || designs.length < 2) return null;
  const at = Math.max(0, designs.findIndex((d) => d.id === node.attrs.variant));
  return designs[(at + dir + designs.length) % designs.length];
}

export function cycleBlockDesign(view: EditorView, dir: 1 | -1): boolean {
  // A selected Glossary chip is the card's Inline design, last in its list: on to Card, back to Compact.
  const sel = view.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'glossaryChip') {
    chipToCard(view, sel.from, dir === 1 ? 'card' : 'compact');
    return true;
  }
  const block = blockForDesign(view.state);
  if (!block) return false;
  const design = nextDesign(block.node, dir);
  if (!design) return true;
  const tr = view.state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, variant: design.id });
  // A selected block stays selected.
  if (view.state.selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, block.pos));
  view.dispatch(tr);
  const dom = view.nodeDOM(block.pos);
  if (dom instanceof HTMLElement) flashDesignName(dom.getBoundingClientRect(), design.label);
  return true;
}

// The new design's name, beside the block's top right for a moment (and read out).
let flashEl: HTMLElement | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function flashDesignName(rect: DOMRect, label: string): void {
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.className = styles.designFlash;
    flashEl.setAttribute('role', 'status');
    document.body.append(flashEl);
  }
  flashEl.textContent = LABELS.noteBlocks.designNow(label);
  flashEl.style.top = `${Math.max(8, rect.top - 30)}px`;
  flashEl.style.left = `${Math.max(8, rect.right - 220)}px`;
  flashEl.removeAttribute('data-hidden');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl?.setAttribute('data-hidden', ''), 1100);
}

export const DesignCycle = Extension.create({
  name: 'designCycle',

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => cycleBlockDesign(this.editor.view, 1),
      'Mod-[': () => cycleBlockDesign(this.editor.view, -1),
    };
  },
});

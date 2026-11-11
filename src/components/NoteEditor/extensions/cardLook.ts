import type { EditorView } from '@tiptap/pm/view';
import type { ContextMenuItem } from '@/contextMenu/types';
import { LABELS } from '@/config/labels';
import { createGlyph, createReviewIcon, createUnsureIcon } from '@/components/Icons';
import { formatDate } from '@/utils/date';
import { importanceLevel } from './importanceLevels';
import { nodeFlag } from './BlockFlags';
import { nodeReview } from './ReviewMark';

// What every card block (CARD_LOOK_NODES) shares as a node, beside the shared look
// (components/CardLook, CLAUDE.md "Cards share one look"): whether its Card design shows its
// kind's icon, the command that sets it, and the right-click item. A new card block spreads
// cardIconAttributes() into its attributes, draws CardIcon / createCardIcon, and adds
// cardIconMenuItem to its menu.

// The blocks drawn in the card look. A new card block joins here (pattern test).
export const CARD_LOOK_NODES = new Set(['glossaryCard', 'questionBlock', 'convertBlock', 'caseStudy']);

export const cardIconAttributes = () => ({
  hideIcon: {
    default: false,
    parseHTML: (el: HTMLElement) => el.hasAttribute('data-hide-icon'),
    renderHTML: (a: Record<string, unknown>) => (a.hideIcon ? { 'data-hide-icon': '' } : {}),
  },
});

export function setCardIcon(view: EditorView, pos: number, show: boolean): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !CARD_LOOK_NODES.has(node.type.name) || !view.editable) return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, hideIcon: !show }));
}

// "Show the icon", ticked while shown: only in the Card design (Compact always shows it).
export function cardIconMenuItem(view: EditorView, pos: number, attrs: Record<string, unknown>): ContextMenuItem[] {
  if (attrs.variant !== 'card') return [];
  return [{ id: 'card-icon', label: LABELS.cardLook.showIcon, icon: attrs.hideIcon ? undefined : '✓', run: () => setCardIcon(view, pos, !!attrs.hideIcon) }];
}

// The kind line of a card drawn by ProseMirror (a question, a case study), as a Glossary card's is
// drawn (GlossaryCardBody): its level of Important said in it ("⭐ Important case study"), then the
// icons of its statuses (Review later, Clarify later, Not sure of this), all read from the block's
// own attributes. A widget built from it is keyed by cardKindKey, so it's redrawn when one changes.
export function createCardKind(label: string, attrs: Record<string, unknown>): HTMLElement {
  const k = document.createElement('div');
  k.contentEditable = 'false';
  k.setAttribute('data-card-part', 'kind');
  const level = attrs.importance === 1 || attrs.importance === 2 || attrs.importance === 3 ? attrs.importance : 0;
  if (level) k.setAttribute('data-importance', String(level));
  k.textContent = level ? `${importanceLevel(level).icon} ${LABELS.importance.kindLevel(level, label)}` : label;
  const flag = (kind: string, title: string, icon: Element) => {
    const s = document.createElement('span');
    s.setAttribute('data-card-flag', kind);
    s.title = title;
    s.append(icon);
    k.append(s);
  };
  const review = nodeReview(attrs);
  const clarify = nodeFlag(attrs, 'clarify');
  const unsure = nodeFlag(attrs, 'unsure');
  if (review) flag('review', `${LABELS.importance.reviewLater} · ${LABELS.importance.due(formatDate(review.due))}`, createReviewIcon());
  if (clarify) flag('clarify', clarify.note ? LABELS.clarify.markerNote(clarify.note) : LABELS.clarify.blockToggle, createGlyph('clarify'));
  if (unsure) flag('unsure', unsure.note ? LABELS.clarify.unsureMarkerWhy(unsure.note) : LABELS.clarify.blockUnsure, createUnsureIcon());
  return k;
}

export const cardKindKey = (attrs: Record<string, unknown>): string =>
  [attrs.importance ?? '', nodeReview(attrs)?.due ?? '', nodeFlag(attrs, 'clarify')?.id ?? '', nodeFlag(attrs, 'unsure')?.id ?? ''].join('|');

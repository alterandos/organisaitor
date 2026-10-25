import { NOTE_BLOCK_KINDS } from '@/components/NoteEditor/objects/blockKinds';
import { BLOCK_DESIGN_LISTS } from '@/components/NoteEditor/extensions/designCycle';
import { GLOSSARY_CARD_DESIGNS } from '@/components/NoteEditor/extensions/GlossaryCard';
import { EMBED_DESIGNS } from '@/components/NoteEditor/extensions/NoteEmbed';
import type { BlockDesign } from '@/components/NoteEditor/extensions/blockDesigns';
import type { NoteBlockKind } from '@/components/NoteEditor/objects/types';
import { EX } from '@/demo/blockExamples';
import { kids, mathBlock, node, p, type J } from '@/demo/noteContent';

// What the block guide (BlockGuidePane.tsx) shows, pure: every `\` block with the node it makes, its
// designs and an example. The examples are the demo account's (demo/blockExamples.ts), so the guide
// and the demo show the same thing. A block that shows a record from your notes (a Glossary card,
// an embedded passage) has no standalone example: BLOCK_GUIDE_NEEDS says what it needs. A test
// fails on a block with neither, so a new block arrives with its example.

// Each `\` block's node.
export const BLOCK_NODE_OF: Record<string, string> = {
  timeline: 'timeline', quote: 'quoteBlock', conclusion: 'conclusion', cycle: 'cycle', breakdown: 'breakdown',
  types: 'types', key: 'idKey', hierarchy: 'hierarchy', pyramid: 'pyramid', chart: 'chart', code: 'codeBlock',
  maths: 'mathBlock', inbox: 'inbox', definition: 'glossaryCard', acronym: 'glossaryCard', concept: 'glossaryCard',
  profile: 'glossaryCard', question: 'questionBlock', compare: 'compareBlock', proscons: 'prosCons',
  argument: 'argument', options: 'options', diagram: 'diagram', convert: 'convertBlock', case: 'caseStudy',
  cause: 'causeEffect', venn: 'vennBlock', hub: 'hub', embed: 'noteEmbed',
};

// The example each node is shown with; the guide sets its design.
export const BLOCK_EXAMPLES: Record<string, () => J> = {
  cycle: EX.cycle, types: EX.types, quoteBlock: EX.quoteBlock, questionBlock: () => EX.questionAnswered(),
  idKey: EX.idKey, compareBlock: EX.compareBlock, hierarchy: EX.hierarchy, breakdown: EX.breakdown,
  conclusion: EX.conclusion, timeline: EX.timeline, chart: EX.chart, diagram: EX.diagram,
  causeEffect: EX.causeEffect, vennBlock: EX.vennBlock, caseStudy: EX.caseStudy, codeBlock: EX.codeBlock,
  argument: EX.argument, prosCons: EX.prosCons, options: EX.options, pyramid: EX.pyramid,
  mathBlock: () => mathBlock('N(t) = N_0 \\, e^{-\\lambda t} \\qquad t_{1/2} = \\frac{\\ln 2}{\\lambda}'),
  // The demo's conversion uses its own converter; here, one everyone has.
  convertBlock: () => node('convertBlock', { variant: 'card', converter: 'mass', from: 't', to: 'kg', values: { amount: '2.4' } }),
  // The demo's hub and inbox link to its notes and tasks; here, the same shape on their own.
  hub: () => kids('hub', { hubId: 'guide-hub', variant: 'list' }, [
    node('hubTitle', null, 'Feedback loops'),
    node('hubTake', null, 'Fast feedbacks amplify warming within decades; the slow one (weathering) pulls it back over millions of years.'),
  ]),
  inbox: () => kids('inbox', { inboxId: 'guide-inbox', variant: 'board', order: 'newest' }, [
    node('inboxTitle', null, 'Essay ideas'),
    ...([['idea', 'Find a cost estimate per tonne for direct air capture.'], ['discussing', 'Compare geoengineering with natural carbon sinks.'], ['parked', 'Who gets to set the global thermostat?']] as const)
      .map(([status, text], i) => kids('inboxItem', { itemId: `guide-ib-${i}`, status, sentAt: null, fromNote: null, fromTab: null, taskId: null }, [p(text)])),
  ]),
};

// What a block without a standalone example needs, by node (strings in LABELS.blockGuide.needs).
export const BLOCK_GUIDE_NEEDS: Record<string, 'glossary' | 'embed'> = { glossaryCard: 'glossary', noteEmbed: 'embed' };

export interface GuideBlock { kind: NoteBlockKind; node: string; designs: readonly BlockDesign<string>[] }

// The blocks in the guide, in the `\` menu's order (marks like `\unsure` and links like `\ref` aren't blocks).
export const GUIDE_BLOCKS: GuideBlock[] = NOTE_BLOCK_KINDS
  .filter((k) => BLOCK_NODE_OF[k.id])
  .map((kind) => {
    const name = BLOCK_NODE_OF[kind.id];
    const designs = name === 'glossaryCard' ? GLOSSARY_CARD_DESIGNS : name === 'noteEmbed' ? EMBED_DESIGNS : BLOCK_DESIGN_LISTS[name] ?? [];
    return { kind, node: name, designs };
  });

// The example as a whole note, drawn in `design`.
export function exampleDoc(name: string, design: string | null): J | null {
  const make = BLOCK_EXAMPLES[name];
  if (!make) return null;
  const block = make();
  const withDesign = design ? { ...block, attrs: { ...(block.attrs as J | undefined), variant: design } } : block;
  return { type: 'doc', content: [kids('section', { columns: 1, locked: false }, [withDesign])] };
}

// Matches a search: the name, the keyword and its other names, the hint.
export const guideMatches = (b: GuideBlock, q: string): boolean => {
  const t = q.trim().toLowerCase().replace(/^\\/, '');
  return !t || [b.kind.label, b.kind.id, ...b.kind.aliases, b.kind.hint].some((s) => s.toLowerCase().includes(t));
};

// THE lists of note blocks and their parts, by node name: plain data, no editor code, so anything
// can read them (the passage lists of utils/noteLinks.ts, lasting ids in extensions/BlockIds.ts)
// without pulling in the blocks themselves. extensions/blockDesigns.ts and blockPicks.ts re-export
// them. A new block adds its root node here, and its part type if it has parts.

// Every note block's root node: selectable whole, framable, linkable.
export const NOTE_BLOCK_NODES = new Set(['timeline', 'quoteBlock', 'conclusion', 'types', 'idKey', 'prosCons', 'argument', 'options', 'cycle', 'breakdown', 'hierarchy', 'pyramid', 'steps', 'chart', 'codeBlock', 'mathBlock', 'inbox', 'glossaryCard', 'questionBlock', 'compareBlock', 'diagram', 'hub', 'convertBlock', 'promptBlock', 'caseStudy', 'causeEffect', 'vennBlock']);

// A block's part type: what Ctrl+click picks, and what a link can point at inside a block.
export const BLOCK_PART_NODES: Record<string, string> = {
  timeline:   'timelineItem',
  quoteBlock: 'quoteField',
  cycle:      'cycleStage',
  breakdown:  'breakdownPart',
  hierarchy:  'hierarchyItem',
  pyramid:    'pyramidLayer',
  steps:      'stepsStep',
  inbox:      'inboxItem',
  hub:        'hubLink',
  questionBlock: 'questionField',
  compareBlock: 'compareSide',
  conclusion: 'conclusionReason',
  types:      'typesItem',
  idKey:      'idKeyStep',
  prosCons:   'prosConsPoint',
  argument:   'prosConsPoint',
  options:    'optionsItem',
  caseStudy:  'caseField',
  causeEffect: 'ceItem',
  vennBlock:  'vennItem',
};

// The parts that are long: they hold paragraphs and bullets, not one line of text
// (extensions/richParts.ts, 2026-11-11). A new long part is added here, with RICH_PART_CONTENT.
export const RICH_PART_NODES: ReadonlySet<string> = new Set(['caseField', 'argumentField', 'questionField']);

// Parts and the blocks around them that a link can point at (a lasting blockId): every block and
// every block's part.
export const LINKABLE_BLOCK_NODES: string[] = [...NOTE_BLOCK_NODES, ...new Set(Object.values(BLOCK_PART_NODES))];

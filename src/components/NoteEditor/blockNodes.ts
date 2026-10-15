// THE lists of note blocks and their parts, by node name: plain data, no editor code, so anything
// can read them (the passage lists of utils/noteLinks.ts, lasting ids in extensions/BlockIds.ts)
// without pulling in the blocks themselves. extensions/blockDesigns.ts and blockPicks.ts re-export
// them. A new block adds its root node here, and its part type if it has parts.

// Every note block's root node: selectable whole, framable, linkable.
export const NOTE_BLOCK_NODES = new Set(['timeline', 'quoteBlock', 'conclusion', 'types', 'idKey', 'prosCons', 'options', 'cycle', 'breakdown', 'hierarchy', 'pyramid', 'chart', 'codeBlock', 'mathBlock', 'inbox', 'glossaryCard', 'questionBlock', 'compareBlock', 'diagram', 'hub']);

// A block's part type: what Ctrl+click picks, and what a link can point at inside a block.
export const BLOCK_PART_NODES: Record<string, string> = {
  timeline:   'timelineItem',
  quoteBlock: 'quoteField',
  cycle:      'cycleStage',
  breakdown:  'breakdownPart',
  hierarchy:  'hierarchyItem',
  pyramid:    'pyramidLayer',
  inbox:      'inboxItem',
  hub:        'hubLink',
  questionBlock: 'questionField',
  compareBlock: 'compareSide',
  conclusion: 'conclusionReason',
  types:      'typesItem',
  idKey:      'idKeyStep',
  prosCons:   'prosConsPoint',
  options:    'optionsItem',
};

// Parts and the blocks around them that a link can point at (a lasting blockId): every block and
// every block's part.
export const LINKABLE_BLOCK_NODES: string[] = [...NOTE_BLOCK_NODES, ...new Set(Object.values(BLOCK_PART_NODES))];

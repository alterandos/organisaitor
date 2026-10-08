import type { NoteBlockKind } from './types';
import { timelineBlock } from './timelineBlock';
import { quoteBlock } from './quoteBlock';
import { cycleBlock } from './cycleBlock';
import { breakdownBlock } from './breakdownBlock';
import { hierarchyBlock } from './hierarchyBlock';
import { pyramidBlock } from './pyramidBlock';
import { chartBlock } from './chartBlock';

// THE registry of note blocks `\` can insert (CLAUDE.md "Inline objects in notes" → note blocks).
// A new block is its node in extensions/ (registered in NoteEditor), a `*Block.ts` here, and one
// entry below — a pattern test checks the entry.
export const NOTE_BLOCK_KINDS: NoteBlockKind[] = [timelineBlock, quoteBlock, cycleBlock, breakdownBlock, hierarchyBlock, pyramidBlock, chartBlock];

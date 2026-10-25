import type { NoteBlockKind } from './types';
import { timelineBlock } from './timelineBlock';
import { quoteBlock } from './quoteBlock';
import { conclusionBlock } from './conclusionBlock';
import { typesBlock } from './typesBlock';
import { idKeyBlock } from './idKeyBlock';
import { prosConsBlock } from './prosConsBlock';
import { argumentBlock } from './argumentBlock';
import { optionsBlock } from './optionsBlock';
import { cycleBlock } from './cycleBlock';
import { breakdownBlock } from './breakdownBlock';
import { hierarchyBlock } from './hierarchyBlock';
import { pyramidBlock } from './pyramidBlock';
import { chartBlock } from './chartBlock';
import { codeBlock } from './codeBlock';
import { mathsBlock } from './mathsBlock';
import { inboxBlock } from './inboxBlock';
import { definitionBlock } from './definitionBlock';
import { acronymBlock } from './acronymBlock';
import { conceptBlock } from './conceptBlock';
import { profileBlock } from './profileBlock';
import { questionBlock } from './questionBlock';
import { compareBlock } from './compareBlock';
import { diagramBlock } from './diagramBlock';
import { convertBlock } from './convertBlock';
import { caseStudyBlock } from './caseStudyBlock';
import { causeEffectBlock } from './causeEffectBlock';
import { vennBlock } from './vennBlock';
import { hubBlock } from './hubBlock';
import { embedBlock } from './embedBlock';
import { noteRefTrigger } from './noteRefTrigger';
import { unsureTrigger } from './unsureTrigger';

// THE registry of note blocks `\` can insert (CLAUDE.md "Inline objects in notes" → note blocks).
// A new block is its node in extensions/ (registered in NoteEditor), a `*Block.ts` here, and one
// entry below — a pattern test checks the entry.
export const NOTE_BLOCK_KINDS: NoteBlockKind[] = [timelineBlock, quoteBlock, conclusionBlock, cycleBlock, breakdownBlock, typesBlock, idKeyBlock, hierarchyBlock, pyramidBlock, chartBlock, codeBlock, mathsBlock, inboxBlock, definitionBlock, acronymBlock, conceptBlock, profileBlock, questionBlock, compareBlock, prosConsBlock, argumentBlock, optionsBlock, diagramBlock, convertBlock, caseStudyBlock, causeEffectBlock, vennBlock, hubBlock, embedBlock, noteRefTrigger, unsureTrigger];

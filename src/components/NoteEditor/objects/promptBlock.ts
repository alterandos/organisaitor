import { LABELS } from '@/config/labels';
import { insertPrompt, openPrompt } from '../extensions/Prompt';
import { PROMPT_ICON } from '../extensions/PromptBody';
import type { NoteBlockKind } from './types';

// `\prompt`: an AI prompt you reuse (extensions/Prompt.ts) in place of what was typed, open, its name ready to type.
export const promptBlock: NoteBlockKind = {
  family:  'block',
  category: 'visual',
  id:      'prompt',
  label:   LABELS.noteBlocks.prompt.label,
  icon:    PROMPT_ICON,
  aliases: ['ai', 'aiprompt', 'agent', 'chatgpt', 'claude', 'llm'],
  hint:    LABELS.noteBlocks.prompt.hint,
  insert:  (view, from, to) => {
    const tr = insertPrompt(view.state, from, to);
    if (!tr) return;
    view.dispatch(tr);
    openPrompt(view, view.state.selection.from, { where: 'title' });
  },
};

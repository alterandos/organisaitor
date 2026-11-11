import type { ReactNode } from 'react';
import { LABELS } from '@/config/labels';
import { showToast } from '@/components/Toast/showToast';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { errorMessage, log } from '@/utils/log';
import type { AssembledPrompt, PromptData } from '@/utils/aiPrompt';

// Where a finished AI prompt (the `\prompt` note block) can go: THE registry (CLAUDE.md "Single
// entry points"). The block never sends anything itself; it lists promptTargets() and calls
// sendPrompt(id, …). Today the one target is the clipboard. When the agent integration is built,
// it registers a target here ("Send to the agent") and every prompt block offers it, with no
// change to the block: see docs/agent-tasks/09-prompt-block-to-agent.md.

export interface PromptToSend {
  prompt: AssembledPrompt;   // the text with its fill-ins put in, and any left empty
  data:   PromptData;        // the prompt as written (title, sections, fill-ins), for a target that wants the parts
}

export interface PromptTarget {
  id:        string;
  label:     string;                 // "Copy", "Send to the agent"
  icon?:     ReactNode;
  order:     number;                 // the lowest available one is the block's main button
  available: () => boolean;          // e.g. signed in, the agent set up
  send:      (p: PromptToSend) => Promise<void>;
}

const targets = new Map<string, PromptTarget>();

export function registerPromptTarget(target: PromptTarget): void {
  targets.set(target.id, target);
}

export function promptTargets(): PromptTarget[] {
  return [...targets.values()].filter((t) => t.available()).sort((a, b) => a.order - b.order);
}

// Sends the prompt to a target. Resolves true once sent (the block then notes when it was).
export async function sendPrompt(targetId: string, p: PromptToSend): Promise<boolean> {
  const target = targets.get(targetId);
  if (!target || !target.available()) return false;
  try {
    await target.send(p);
    return true;
  } catch (e) {
    log.warn('aiPrompt', `could not send to ${targetId}`, errorMessage(e));
    await alertDialog(LABELS.noteBlocks.prompt.sendFailed(target.label));
    return false;
  }
}

// The clipboard: always there.
registerPromptTarget({
  id: 'copy',
  label: LABELS.noteBlocks.prompt.copy,
  order: 100,
  available: () => true,
  send: async ({ prompt }) => {
    await navigator.clipboard.writeText(prompt.text);
    const L = LABELS.noteBlocks.prompt;
    showToast({ message: L.copied, detail: prompt.missing.length ? L.leftEmpty(prompt.missing) : undefined });
  },
});

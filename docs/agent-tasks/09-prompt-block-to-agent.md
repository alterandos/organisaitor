# 09 — Send a note's AI prompt straight to the in-app agent

Status: Not started (brief written 2026-11-11). **Waits on the in-app agent's chat** (`03-ai-assistant-next-steps.md`): do this the day there's a chat a prompt can be sent to.

The Notes app has an **AI prompt block** (`\prompt`, built 2026-11-11): a prompt the user reuses run after run. It has sections under the user's own headings, each either *kept* (background sent every time) or *each run* (emptied for a new run), and *fill-ins* (`{project}` written in any section, filled in once per run). Today the only thing it can do with a finished prompt is copy it to the clipboard. The user asked for it to be "plug and play" once the agent integration exists: **sending a prompt to the agent should be one registration, with no change to the block.** This brief is that piece.

---

## 1. Getting up to speed (read only this)

1. **`CLAUDE.md` in full**, especially "Agent command layer — the boundary rule", "Single entry points" (the row "Send a finished AI prompt somewhere") and "Documentation Protocol".
2. **`src/services/aiPromptTargets.ts`** — the whole hook. The block never sends anything itself; it lists `promptTargets()` and calls `sendPrompt(id, { prompt, data })`. A target is `{ id, label, icon?, order, available, send }`. The one there today is `copy` (order 100).
3. **`src/utils/aiPrompt.ts`** — what a prompt is (`PromptData`: title, sections, fills, template) and `assemblePrompt` (the text as sent: Markdown `## Heading` per section, fill-ins put in, `missing` = fill-ins left empty and kept as `{name}`).
4. Skim `src/components/NoteEditor/extensions/PromptBody.tsx` only to see how targets are drawn: every available target is a button, the lowest `order` is the main (filled) one and the one Ctrl+Enter sends.
5. The feature entry "AI prompt block" in `docs/features/implemented-features.md`.
6. `docs/agent-tasks/03-ai-assistant-next-steps.md` and `docs/ai/02-command-layer.md` for the agent itself (chat, provider, command layer).

## 2. The task

**Register a "Send to the agent" target** from the agent's own code (wherever the chat lives), e.g. in the module that starts the chat:

```ts
import { registerPromptTarget } from '@/services/aiPromptTargets';

registerPromptTarget({
  id: 'agent',
  label: LABELS.agent.sendPrompt,     // add to config/labels.ts
  order: 10,                          // below copy's 100: becomes the main button and Ctrl+Enter
  available: () => agentIsSetUp(),    // a key or local model configured; else the block shows Copy only
  send: async ({ prompt, data }) => { openAgentChat({ text: prompt.text, title: data.title }); },
});
```

Decide with the user, before building:
- **Does sending start a new conversation or add to the open one?** (A prompt is the start of a run, so a new conversation is the likely answer.)
- **What happens to fill-ins left empty** (`prompt.missing`)? Copy sends them as `{name}` and says so in a toast. For the agent, asking first ("2 fill-ins are empty: send anyway?" through `choiceDialog`) is probably better. Put that inside `send`, not in the block.
- **Should the agent see the parts** (`data.sections`, which are kept and which are this run's) or only the text? `data` is passed for exactly this; using it is optional.
- **Order:** should Send to the agent become the main button (order below 100), or stay second to Copy?

**Don't:**
- add a send path inside the block, or a second registry;
- let the agent read prompt blocks through the command layer as a side effect of this (a read command for notes is Chunk B's, with its encryption rules);
- send a prompt from an encrypted note anywhere the user didn't choose (the user presses the button, so this is fine as long as the target only acts on that press).

## 3. What done looks like

- In a note, every prompt block shows "Send to the agent" (and still Copy) once the agent is set up; Ctrl+Enter in a prompt sends to whichever target is main.
- The chat opens with the prompt; `sentAt` on the block updates (the block does this itself when `sendPrompt` resolves true).
- Nothing in `PromptBody.tsx`, `Prompt.ts` or `aiPrompt.ts` changed (if something had to, record why: the hook missed a case).

## 4. How to verify

- `src/components/NoteEditor/extensions/Prompt.test.ts` already has "a target registered later (the agent) is offered by every prompt with no change to the block": it must still pass.
- Add a test beside the agent code: the target is unavailable until the agent is set up, and `send` opens the chat with `prompt.text`.
- Check once in the app: a prompt with an empty fill-in, sent to the agent.

## 5. When done

- Set the Status line above to `Done YYYY-MM-DD — …`.
- Record it in `docs/features/implemented-features.md` (edit the "AI prompt block" entry's *Not built* line in place) and tick it off in BACKLOG.md ("AI prompt block: send to the agent").
- Update `docs/ai/02-command-layer.md` "Not built" if anything there changes, and the end-of-session report.

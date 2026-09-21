import { runCommand, revertBatch, toolDefinitions } from '@/agent';

declare global {
  interface Window {
    __agent?: { run: typeof runCommand; revert: typeof revertBatch; tools: typeof toolDefinitions };
  }
}

// Development builds only (App.tsx loads this behind import.meta.env.DEV): lets the commands be
// tried from the browser console, e.g. __agent.run('get_context', {}). Nothing in the app calls it.
window.__agent = { run: runCommand, revert: revertBatch, tools: toolDefinitions };

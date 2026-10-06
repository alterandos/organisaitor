import { datedObjectKind } from './datedKindFactory';

// `\deadline essay due fri 5pm` — see datedKindFactory.ts (shared with Reminder). A Deadline
// notifies ahead of time ("N days before"), never at the moment; its pane shows that setting.
export const deadlineKind = datedObjectKind('deadline', ['dl', 'due', 'd']);

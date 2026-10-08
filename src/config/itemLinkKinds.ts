import { LABELS } from '@/config/labels';
import type { ItemLinkKind } from '@/types';

export interface ItemLinkKindDef {
  kind:      ItemLinkKind;
  icon:      string;
  // The owning task can't be done until the target is: an open (not completed, not archived)
  // target makes it "blocked". Blocking kinds are also the ones checked for loops.
  blocks:    boolean;
  // Reads the same from both ends, so A→B and B→A count as the same link.
  symmetric: boolean;
  out:       string;   // label on the owning task ("Waiting on")
  in:        string;   // label on the target ("Unlocks")
}

// THE list of task-link kinds. A new kind is one entry here, plus its labels in LABELS.taskLinks
// and the ItemLinkKind union — the store, the blocking logic and the pane all read from this.
// A follow-up blocks too: it comes after the task it came from, so one created before that task
// is done waits for it (confirmed with the user 2026-10-01).
export const ITEM_LINK_KINDS: Record<ItemLinkKind, ItemLinkKindDef> = {
  dependsOn:  { kind: 'dependsOn',  icon: '⛓', blocks: true,  symmetric: false, ...LABELS.taskLinks.kinds.dependsOn },
  followUpOf: { kind: 'followUpOf', icon: '↳',  blocks: true,  symmetric: false, ...LABELS.taskLinks.kinds.followUpOf },
  related:    { kind: 'related',    icon: '🔗', blocks: false, symmetric: true,  ...LABELS.taskLinks.kinds.related },
  // A recurring task's next occurrence, linked to the one it repeats (services/recurringTasks.ts).
  repeatOf:   { kind: 'repeatOf',   icon: '🔁', blocks: false, symmetric: false, ...LABELS.taskLinks.kinds.repeatOf },
};

export const ITEM_LINK_KIND_ORDER: ItemLinkKind[] = ['dependsOn', 'followUpOf', 'related', 'repeatOf'];

// Suite-wide Recycling Bin — see CLAUDE.md "Recycling Bin" and src/services/trash.ts.

export type TrashEntryId = string & { readonly _brand: 'TrashEntryId' };

// One member per store delete action that feeds the bin (see services/trash.ts's RESOLVERS
// and RESTORE_TARGETS — every kind here must have an entry in both).
export type TrashableKind =
  | 'task' | 'collection' | 'tag' | 'purpose'
  | 'calendarEvent' | 'calendarReminder' | 'schedule' | 'trackerEntry'
  | 'list' | 'listItem' | 'listType'
  | 'note' | 'noteTag' | 'structuredTagEntry'
  | 'watchlistItem' | 'portfolioTag' | 'investmentPurpose'
  | 'activity' | 'activityType';

// Agents can't delete anything today (see access.ts's "no delete, ever" boundary) — this
// union exists so a trash entry can distinguish who deleted it once they can, without a
// breaking change to TrashEntry later. Nothing produces the 'agent' branch yet.
export type DeletedBy = { type: 'user' } | { type: 'agent'; batchId: string };

export interface TrashEntry {
  id:            TrashEntryId;
  kind:          TrashableKind;
  sourceApp:     'organizer' | 'notes' | 'portfolio' | 'fitness';
  sourceSection: string;    // 'Tasks' | 'Calendar' | 'Records' | 'Lists' | 'Notes' | 'Portfolio' | 'Fitness'
  title:         string;    // resolved at delete time — never re-derived later (a parent Endeavour may itself be trashed)
  contextLine:   string;    // subtype + dates, also resolved at delete time
  snapshot:      unknown;   // the full entity object, verbatim, the instant before removal
  deletedAt:     string;    // ISO — when the ORIGINAL ENTITY was deleted (not a sync tombstone)
  deletedBy:     DeletedBy;
}

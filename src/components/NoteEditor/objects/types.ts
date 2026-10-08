import type { CollectionId, CrossAppRef, CrossAppRefType } from '@/types';
import type { EditorView } from '@tiptap/pm/view';

// Inline objects in notes: type `\`, pick a kind, keep typing, Enter creates it and links the
// text to it (CLAUDE.md "Inline objects in notes"). Everything a kind needs to know lives in its
// NoteObjectKind; the trigger plugin, the menu, commit and the link rendering are generic.

// Where the object is being created.
export interface NoteObjectContext {
  noteId:       string;
  tabId?:       string;                // CrossAppRef.tabId form (undefined on a note without tabs)
  collectionId: CollectionId | null;   // the note's Endeavour, else the one focused in Notes
  now:          Date;
}

// One editable line of the preview, in Tab order.
export interface NoteObjectField {
  key:         string;
  label:       string;
  value:       string;    // what the draft currently holds, formatted for display
  placeholder: string;    // shown when the field is empty: what an empty value means
}

// One kind of object `\` can create. D is the kind's draft: what it understood so far.
export interface NoteObjectKind<D> {
  id:          string;                // the canonical keyword: `\reminder`
  targetType:  CrossAppRefType;       // what the link records; needs an ARTIFACT_TYPES entry
  label:       string;
  icon:        string;
  aliases:     string[];              // other keywords: `\rem`, `\r`
  hint:        string;                // one line under the label in the menu
  // What the text typed after the keyword means. Pure; `ctx.now` is "now".
  parse:       (body: string, ctx: NoteObjectContext) => D;
  // The preview's fields for a draft.
  fields:      (draft: D) => NoteObjectField[];
  // A field typed into the preview. null = not understood (the field shows as invalid).
  applyField:  (draft: D, key: string, raw: string, ctx: NoteObjectContext) => D | null;
  // Why the draft can't be created yet, or null.
  validate:    (draft: D) => string | null;
  // Creates the object, linked back to the note, and returns its id.
  create:      (draft: D, ctx: NoteObjectContext, backLinks: CrossAppRef[]) => string;
  // Undo of create (the toast's Undo): removes it without leaving it in the Recycling Bin.
  discard:     (id: string) => void;
  // Opens the kind's full creation pane, prefilled. The caller has already set
  // uiStore.pendingArtifactLink, so the pane links the text back the way Ctrl+Q does.
  openFull:    (draft: D, ctx: NoteObjectContext) => void;
  // The toast's one-line description of what was created.
  describe:    (draft: D) => string;
  // The note text to link when nothing was typed after the keyword (it all went into the fields).
  linkText:    (draft: D) => string;
}

// The registry holds kinds with different drafts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNoteObjectKind = NoteObjectKind<any>;

// A note block: something `\` puts into the note itself (a timeline), rather than an item made
// elsewhere in the app and linked. No draft and no preview: picking it inserts it, and the
// writing happens in the block. Registered in NOTE_BLOCK_KINDS (blockKinds.ts).
export interface NoteBlockKind {
  family:  'block';
  id:      string;      // the canonical keyword: `\timeline`
  label:   string;
  icon:    string;
  aliases: string[];
  hint:    string;
  // Replaces the typed `\…` (from..to) with the block, the cursor inside it. Ends the session.
  insert:  (view: EditorView, from: number, to: number) => void;
}

// Anything the `\` menu offers.
export type PickableKind = AnyNoteObjectKind | NoteBlockKind;

export const isBlockKind = (k: PickableKind): k is NoteBlockKind => (k as NoteBlockKind).family === 'block';

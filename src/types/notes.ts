// ── Branded ID types ───────────────────────────────────────────────────────────
import type { CollectionId } from './index';

export type NoteId = string & { readonly _brand: 'NoteId' };
export type NoteTagId = string & { readonly _brand: 'NoteTagId' };

// ── Note tag attribute schema ──────────────────────────────────────────────────
// A self-contained field type for annotation tag attributes (no circular import with index.ts).
export type NoteTagFieldType = 'text' | 'number' | 'date' | 'url' | 'select' | 'boolean' | 'rating';

export interface NoteTagFieldDef {
  id:       string;              // nanoid(8) — stable key in tagData
  name:     string;
  type:     NoteTagFieldType;
  options?: string[];            // for select
}

// ── Note tab ──────────────────────────────────────────────────────────────────
export interface NoteTab {
  id: string;       // nanoid
  name: string;
  content: string;  // Rich-text JSON (same format as Note.content)
}

// ── Note entity ────────────────────────────────────────────────────────────────
export interface Note {
  id: NoteId;
  title: string;
  content: string;                    // Rich-text JSON (default / first tab)
  tagIds: NoteTagId[];                // Hierarchical tags (areas, subjects, topics)
  tagData: Record<string, Record<string, unknown>>;  // [NoteTagId][NoteTagFieldDef.id] = value
  createdAt: string;                  // ISO 8601
  updatedAt: string;
  abstract: string | null;            // Optional collapsible summary at top of note
  lastViewedAt: string | null;
  archivedAt: string | null;          // Soft delete
  color: string | null;               // User-chosen highlight color
  pinned: boolean;                    // Quick access from landing page
  userId: string;                     // Supabase auth.user_id
  parentId: NoteId | null;            // Sub-note parent; null = top-level
  tabs: NoteTab[];                    // Additional tabs (main content stays in .content)
  mainTabName: string;                // Display name for the implicit main tab (default 'Main')
  tabOrder: string[];                 // Ordered IDs including '__main__'; [] = default order (main first)
  templateId: string | null;          // NoteTemplateDef.id used to create this note (config/noteTemplates.ts); null = blank/unknown
  collectionId: CollectionId | null;  // Endeavour this note belongs to; defaults to its notebook's Endeavour on create (see noteStore.addNote)
}

// ── NoteTag entity (hierarchical) ──────────────────────────────────────────────
export interface NoteTag {
  id: NoteTagId;
  name: string;
  description?: string;
  kind: 'area' | 'tag';              // 'area' = notebook/hierarchy node; 'tag' = cross-cutting annotation label
  parentTagId: NoteTagId | null;      // Enables Area > Subject > Topic hierarchy
  tagTypeId: string | null;           // "definition", "reference", etc. (Phase 2)
  color: string | null;
  icon: string | null;                // Emoji or icon name
  order: number;                      // For sorting siblings
  fieldSchema: NoteTagFieldDef[];     // Attributes that can be filled per note (meaningful for kind='tag')
  presetKey?: string;                 // Set when created from a preset pack (e.g. 'academic'); undefined = fully user-created
  collectionId: CollectionId | null;  // Endeavour this notebook belongs to (meaningful for kind='area'); notes tagged with this notebook inherit it on create
  createdAt: string;                  // ISO 8601
  updatedAt: string;
  userId: string;
}

// ── Input types ────────────────────────────────────────────────────────────────
export interface CreateNoteInput {
  title: string;
  content?: string;
  tagIds?: NoteTagId[];
  color?: string | null;
  templateId?: string | null;
  collectionId?: CollectionId | null;
}

export interface CreateNoteTagInput {
  name: string;
  description?: string;
  kind?: 'area' | 'tag';
  parentTagId?: NoteTagId | null;
  tagTypeId?: string | null;
  color?: string | null;
  icon?: string | null;
  fieldSchema?: NoteTagFieldDef[];
  presetKey?: string;
  collectionId?: CollectionId | null;
}

-- Bi-directional cross-app links, first cut (Notes -> Task). The forward half (a note
-- linking to a task it created) lives embedded in the note's own rich-text content as an
-- ArtifactLinkMark, not in a table. This migration adds the reverse half: a generic,
-- embedded list field on tasks recording which other-app entities point at them (a note,
-- for now — event/listItem/trackerEntry are the planned next targets, see CLAUDE.md
-- "Cross-app linking"). Deliberately NOT using the existing (still-unused) cross_app_links
-- table — see CLAUDE.md for why a simple embedded field was chosen over that normalized
-- join, matching the same reasoning already applied to calendar_event_id/calendar_reminder_id.

alter table tasks
  add column if not exists cross_app_refs jsonb not null default '[]'::jsonb;

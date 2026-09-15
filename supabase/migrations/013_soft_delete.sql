-- Soft-delete (tombstone) support for cross-device sync.
--
-- Previously syncDiff() issued a real `delete` when a locally-removed item's ID
-- vanished from the store. This meant a second device could never tell "deleted on
-- another device" apart from "created locally and not yet uploaded" — it fetches
-- every current row on hydrateStores() and can only add/update from that set, never
-- remove. A hard delete left no trace to reconcile against, so deletions silently
-- never propagated to a second device (confirmed 2026-09-16: a task deleted on
-- desktop stayed visible on a phone indefinitely, even after repeated refreshes).
--
-- syncDiff() now sets deleted_at instead of issuing DELETE. hydrateStores() removes
-- any local entry whose remote row has deleted_at set, and otherwise merges by
-- comparing updated_at (see mergeRecords() in syncService.ts) instead of letting
-- remote unconditionally win — fixing a second, related bug where a locally-edited
-- item (e.g. an un-archived-locally Endeavour) got silently reverted to a stale
-- remote copy on next login/refresh.
--
-- Not yet built: a periodic purge of old tombstones. Rows with deleted_at set are
-- kept indefinitely for now — fine at this data scale, but worth revisiting if these
-- tables ever grow large.

alter table tasks              add column if not exists deleted_at timestamptz;
alter table collections        add column if not exists deleted_at timestamptz;
alter table tags               add column if not exists deleted_at timestamptz;
alter table purposes           add column if not exists deleted_at timestamptz;
alter table calendar_events    add column if not exists deleted_at timestamptz;
alter table calendar_reminders add column if not exists deleted_at timestamptz;
alter table tracker_entries    add column if not exists deleted_at timestamptz;

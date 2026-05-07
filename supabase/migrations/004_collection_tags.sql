-- ================================================================
-- Migration 004 — tag_ids on collections
-- Run in the Supabase SQL Editor after 003_tracker_entries.sql
-- ================================================================

alter table collections
  add column if not exists tag_ids text[] not null default '{}';

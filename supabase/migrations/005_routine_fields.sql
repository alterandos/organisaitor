-- Add routine-specific columns to the collections table

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS routine_tasks jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS repeat_config jsonb;

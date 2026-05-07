-- Add notes column to tags table

ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS notes text;

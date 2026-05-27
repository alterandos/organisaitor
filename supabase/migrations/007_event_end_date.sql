-- Add end_date column to calendar_events for multi-day event support
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS end_date text;

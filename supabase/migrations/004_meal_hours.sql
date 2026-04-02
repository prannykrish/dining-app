-- Add start/end time columns to meals so we can show open/closed status in the app
ALTER TABLE meals ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS end_time TIME;

-- Run this in Supabase Dashboard → SQL Editor → New query

-- 1. Add category column to menu_items (stores DineOnCampus category name per item)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- 2. Allow half-star ratings (0.5 increments, e.g. 3.5)
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE reviews ALTER COLUMN rating TYPE NUMERIC(2,1) USING rating::NUMERIC(2,1);
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 0.5 AND 5.0);

-- 3. Insert a default user for TEMP_USER_ID = 1 (fixes the 500 error on review submit)
INSERT INTO users (id, username) VALUES (1, 'anonymous') ON CONFLICT DO NOTHING;

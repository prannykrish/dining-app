-- Run in Supabase Dashboard → SQL Editor → New query

-- 1. Create stations table (one row per category per meal)
CREATE TABLE IF NOT EXISTS stations (
    id      SERIAL PRIMARY KEY,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name    VARCHAR(100) NOT NULL,
    UNIQUE (meal_id, name)
);

CREATE INDEX IF NOT EXISTS idx_stations_meal ON stations (meal_id);

-- 2. Back-fill stations from existing menu_items.category data
INSERT INTO stations (meal_id, name)
SELECT DISTINCT meal_id, category
FROM menu_items
WHERE category IS NOT NULL
ON CONFLICT (meal_id, name) DO NOTHING;

-- 3. Add station_id FK to menu_items (nullable so back-fill can run first)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL;

UPDATE menu_items mi
SET station_id = s.id
FROM stations s
WHERE s.meal_id = mi.meal_id
  AND s.name    = mi.category
  AND mi.station_id IS NULL;

-- 4. Pivot reviews from menu_item_id → station_id
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS station_id INTEGER REFERENCES stations(id) ON DELETE CASCADE;

-- Drop old unique constraint before removing the column
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_user_id_menu_item_id_key;

-- Drop old FK column
ALTER TABLE reviews DROP COLUMN IF EXISTS menu_item_id;

-- New unique constraint: one review per user per station
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_user_id_station_id_key;
ALTER TABLE reviews ADD CONSTRAINT reviews_user_id_station_id_key UNIQUE (user_id, station_id);

-- Swap indexes
DROP INDEX IF EXISTS idx_reviews_item;
CREATE INDEX IF NOT EXISTS idx_reviews_station ON reviews (station_id);

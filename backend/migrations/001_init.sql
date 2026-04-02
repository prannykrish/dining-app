CREATE TABLE IF NOT EXISTS dining_halls (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
    id             SERIAL PRIMARY KEY,
    meal_type      VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    date           DATE NOT NULL,
    dining_hall_id INTEGER NOT NULL REFERENCES dining_halls(id),
    UNIQUE (meal_type, date, dining_hall_id)
);

CREATE TABLE IF NOT EXISTS menu_items (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(200) NOT NULL,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    username   VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text         VARCHAR(500),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, menu_item_id)
);

-- Seed dining halls
INSERT INTO dining_halls (name) VALUES ('Duncan'), ('Commons'), ('Sbisa')
ON CONFLICT (name) DO NOTHING;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_meals_date_hall ON meals (date, dining_hall_id);
CREATE INDEX IF NOT EXISTS idx_reviews_item   ON reviews (menu_item_id);

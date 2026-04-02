-- Add Clerk auth fields to users table
-- clerk_id is the user's Clerk user ID (e.g. "user_2abc...")
-- Partial unique index so NULL clerk_ids (legacy rows) don't conflict
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id_unique
  ON users (clerk_id)
  WHERE clerk_id IS NOT NULL;

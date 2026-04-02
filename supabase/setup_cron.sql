-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- It schedules the scrape-menus function to run every day at midnight CST (06:00 UTC).
-- Menus are posted by DineOnCampus at least a day in advance, so midnight is safe.
--
-- Before running:
--   1. Deploy the Edge Functions first (see README steps)
--   2. Replace YOUR_SERVICE_ROLE_KEY below with your actual key
--      → Supabase Dashboard → Settings → API → service_role key

-- Step 1: Store the service role key in Vault (encrypted, never visible in plain SQL again)
-- Replace YOUR_SERVICE_ROLE_KEY with your actual key, run this once, then delete it from your history.
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

-- Step 2: Schedule the cron job — reads the key from Vault at runtime
select cron.schedule(
  'scrape-daily-menus',         -- job name (must be unique)
  '0 6 * * *',                   -- cron: every day at 06:00 UTC (midnight CST / 1 AM CDT)
  $$
  select
    net.http_post(
      url     := 'https://ijhtgebeayiqladhitnr.supabase.co/functions/v1/scrape-menus',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
        )
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- To verify the job was created:
-- select * from cron.job;

-- To manually trigger a scrape right now (run in SQL Editor):
-- select net.http_post(
--   url     := 'https://ijhtgebeayiqladhitnr.supabase.co/functions/v1/scrape-menus',
--   headers := jsonb_build_object(
--     'Content-Type',  'application/json',
--     'Authorization', 'Bearer ' || (
--       select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
--     )
--   ),
--   body    := '{}'::jsonb
-- );

-- To delete the job if you ever need to reschedule:
-- select cron.unschedule('scrape-daily-menus');

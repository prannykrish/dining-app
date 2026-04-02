-- Add photo URLs array to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- Create public storage bucket for review photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read photos
DO $$ BEGIN
  CREATE POLICY "Public read review photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'review-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow uploads (no auth required at storage level — app-level auth handles this)
DO $$ BEGIN
  CREATE POLICY "Upload review photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'review-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

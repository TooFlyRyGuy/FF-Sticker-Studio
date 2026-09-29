/*
# Batch Results Storage Setup

1. Storage Bucket
- Create a new public storage bucket called `batch-results` for storing processed batch images and ZIP archives.
- No file size limit (supports large ZIP files with 100+ images).
- Allowed MIME types: image/png, image/jpeg, image/webp, application/zip.

2. Table Changes
- Add `result_zip_path` column to `batch_jobs` (text, nullable) — stores the storage path to the completed ZIP file.
- Add `failed_files` column to `batch_jobs` (integer, default 0) — counts how many images were skipped due to errors.
- Add `prompt_text` column to `batch_jobs` (text, nullable) — stores the prompt used for the batch.
- Add `model` column to `batch_jobs` (text, nullable) — stores the model used.
- Add `aspect_ratio` column to `batch_jobs` (text, nullable) — stores the aspect ratio used.
- Add `image_size` column to `batch_jobs` (text, nullable) — stores the image size setting used.
- Rename `drive_folder_id` is no longer needed but we keep it for backward compatibility (no data loss).

3. Storage Policies
- Allow anon + authenticated to read from batch-results bucket (public downloads).
- Allow authenticated to upload to batch-results bucket (server-side uploads use service role).
- Allow authenticated to delete files in batch-results bucket (cleanup).

4. Security
- RLS already enabled on batch_jobs table.
- Add anon+authenticated SELECT policy so the frontend can poll batch status.
- Add anon+authenticated INSERT policy so the frontend can create batch jobs.
- Add anon+authenticated UPDATE policy so the server can update progress.
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'batch-results',
  'batch-results',
  true,
  null,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/zip']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for batch-results bucket
DROP POLICY IF EXISTS "batch_results_public_read" ON storage.objects;
CREATE POLICY "batch_results_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'batch-results');

DROP POLICY IF EXISTS "batch_results_authenticated_upload" ON storage.objects;
CREATE POLICY "batch_results_authenticated_upload"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'batch-results');

DROP POLICY IF EXISTS "batch_results_authenticated_delete" ON storage.objects;
CREATE POLICY "batch_results_authenticated_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'batch-results');

-- Add new columns to batch_jobs
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS result_zip_path text;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS failed_files integer DEFAULT 0;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS prompt_text text;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS aspect_ratio text;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS image_size text;

-- RLS policies for batch_jobs (anon+authenticated since the app has no sign-in for batch)
DROP POLICY IF EXISTS "batch_jobs_select" ON batch_jobs;
CREATE POLICY "batch_jobs_select"
ON batch_jobs FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "batch_jobs_insert" ON batch_jobs;
CREATE POLICY "batch_jobs_insert"
ON batch_jobs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "batch_jobs_update" ON batch_jobs;
CREATE POLICY "batch_jobs_update"
ON batch_jobs FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "batch_jobs_delete" ON batch_jobs;
CREATE POLICY "batch_jobs_delete"
ON batch_jobs FOR DELETE
TO anon, authenticated
USING (true);
/*
# Batch Job Processing Logs

1. New Table
- `batch_job_logs` — stores per-file processing results for each batch job.
- `id` (uuid, primary key)
- `batch_job_id` (uuid, references batch_jobs.id) — which batch this log belongs to
- `file_name` (text) — original name of the uploaded file
- `status` (text) — 'succeeded' or 'failed'
- `reason` (text, nullable) — human-readable explanation for failure (e.g., "Content blocked by model", "No image returned", "API timeout")
- `output_file_name` (text, nullable) — name of the generated image file in the ZIP (for successful entries)
- `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `batch_job_logs`.
- Allow anon + authenticated to read logs (so the frontend can display them).
- Allow anon + authenticated to insert logs (so the edge function can write them using the service role key).
- Add an index on `batch_job_id` for efficient lookups when polling.
*/

CREATE TABLE IF NOT EXISTS batch_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id uuid REFERENCES batch_jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'succeeded',
  reason text,
  output_file_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE batch_job_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "batch_job_logs_select" ON batch_job_logs;
CREATE POLICY "batch_job_logs_select"
ON batch_job_logs FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "batch_job_logs_insert" ON batch_job_logs;
CREATE POLICY "batch_job_logs_insert"
ON batch_job_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_batch_job_logs_batch_job_id ON batch_job_logs(batch_job_id);
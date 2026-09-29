/*
# Add Google Batch API tracking columns to batch_jobs

1. Table Changes
- Add `gemini_batch_name` (text, nullable) — stores the Google Batch API job name returned by `ai.batches.create()`, used to poll status via `ai.batches.get()`.
- Add `batch_api_state` (text, nullable) — tracks the current Google Batch API job state (e.g., JOB_STATE_PENDING, JOB_STATE_RUNNING, JOB_STATE_SUCCEEDED, JOB_STATE_FAILED).

2. Security
- RLS already enabled on batch_jobs. No policy changes needed — existing policies cover these columns.
*/

ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS gemini_batch_name text;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS batch_api_state text;

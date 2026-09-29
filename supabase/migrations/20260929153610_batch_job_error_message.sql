/*
# Add error_message column to batch_jobs

1. Table Changes
- Add `error_message` column to `batch_jobs` (text, nullable) — stores a human-readable summary of why a batch failed or had partial failures.
  - Examples: "All images failed to process", "ZIP file could not be created", "Server error during processing"
- This persists the failure reason so it survives page refreshes and can be shown in the notification bell.

2. Security
- RLS already enabled on batch_jobs. No policy changes needed — existing anon+authenticated UPDATE policy covers writing this column.
*/

ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS error_message text;

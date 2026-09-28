-- Allow anon role to UPDATE prompts that are public (user_id IS NULL)
-- The app uses a local-only login (no real Supabase auth session),
-- so the anon role needs to be able to update ownerless/public prompts.
CREATE POLICY "Anon can update public prompts"
  ON prompts FOR UPDATE
  TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

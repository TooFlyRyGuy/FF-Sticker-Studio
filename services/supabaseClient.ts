import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ufbjphmsblgwzkofpgai.supabase.co';
// Use the service role key if provided in the environment (Settings -> Secrets), otherwise fall back to the publishable anon key
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ha-_7AikIAhQ9_8-T19HGw_jU2ePTSP';

export const supabase = createClient(supabaseUrl, supabaseKey);

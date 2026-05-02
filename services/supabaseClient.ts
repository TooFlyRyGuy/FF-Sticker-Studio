import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ufbjphmsblgwzkofpgai.supabase.co';
const supabaseKey = 'sb_publishable_Ha-_7AikIAhQ9_8-T19HGw_jU2ePTSP';

export const supabase = createClient(supabaseUrl, supabaseKey);

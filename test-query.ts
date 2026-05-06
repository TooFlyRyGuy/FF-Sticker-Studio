import { supabase } from './services/supabaseClient';
async function test() {
  const { data, error } = await supabase.from('prompts').select('*').limit(1);
  if (error) console.error(error);
  console.log(Object.keys(data?.[0] || {}));
}
test();

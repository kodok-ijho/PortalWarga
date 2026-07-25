import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mzjgliclzihrdjaqzmqg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16amdsaWNsemlocmRqYXF6bXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzcyMTcsImV4cCI6MjA5OTAxMzIxN30.XWUEM2QSP0ifOifcLV5WavegyNTxcjqvRWY7Re7ll6I';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  console.log('🔍 Testing Supabase auth & profiles...');

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'denmas.dyudhiantoro@gmail.com');

  console.log('👤 Warga Profile:', profiles, profErr);

  const { data: adminProfiles, error: adminErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'dyudhiantoro@gmail.com');

  console.log('👑 Admin Profile:', adminProfiles, adminErr);
})();

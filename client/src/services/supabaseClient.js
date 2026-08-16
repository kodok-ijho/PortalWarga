import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseBrowserKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] URL atau publishable/anon key Supabase belum diset di environment aktif. ' +
      'Salin .env.example ke .env dan isi kredensial Supabase Anda.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseBrowserKey ?? 'placeholder-browser-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing environment variable REACT_APP_SUPABASE_URL required to initialize Supabase client.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing environment variable REACT_APP_SUPABASE_ANON_KEY required to initialize Supabase client.'
  );
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

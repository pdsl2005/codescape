// Initialize Supabase client using environment variables.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Fail fast if either variable is missing rather than getting
// a cryptic error later when a database call is made
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

// Export a single shared client instance used across the app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

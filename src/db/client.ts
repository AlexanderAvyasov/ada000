import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Use service role key on trusted server environments if provided to bypass
// row-level security for server-side operations. Fall back to the provided
// anon/publishable key otherwise.
const supabaseKey = config.SUPABASE_SERVICE_ROLE_KEY ?? config.SUPABASE_KEY;

export const supabase = createClient(config.SUPABASE_URL, supabaseKey, {
	auth: { persistSession: false },
});

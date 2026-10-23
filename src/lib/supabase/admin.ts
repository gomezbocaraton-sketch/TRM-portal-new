import { createClient } from '@supabase/supabase-js';

// Full-access database client for server-only jobs that run without a signed-in user (the daily QuickBooks sync).
// Never import this from a page, component or anything that runs in the browser.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

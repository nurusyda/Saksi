import { createClient } from '@supabase/supabase-js';

// Service-role client — server-only. Never import this in client components.
// SUPABASE_SERVICE_ROLE_KEY must never appear in any NEXT_PUBLIC_ variable.
export const supabaseServer = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

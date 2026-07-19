'use client';

import { createClient } from '@supabase/supabase-js';

// Unused until slice 2 (forced-check page). Intentional.
// Anon client for browser — safe to bundle; only reads columns allowed by RLS.
export const supabaseClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

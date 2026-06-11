import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Browser client: publishable anon key only (RLS is the security boundary).
// Values come from NEXT_PUBLIC_* env vars; the literals below are the
// PRE-EXISTING public anon credentials kept as fallback for local
// compatibility until the env vars are configured everywhere.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://krycyeiwsplztagajauh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyeWN5ZWl3c3BsenRhZ2FqYXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzA4ODYsImV4cCI6MjA4NTkwNjg4Nn0.UFp-2sbjXvl2Pv98ItXcpTNsVqsd0aXG3ub9AhfpjHI";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Use localStorage only in browser environments to avoid SSR errors
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});

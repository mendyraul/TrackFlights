import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  // Keep builds/lint non-interactive in CI while still surfacing missing envs during runtime.
  console.warn("[web] Missing NEXT_PUBLIC_SUPABASE_* env vars; using placeholder values.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

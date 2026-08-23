import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null | undefined;

function readBrowserEnv(name: string) {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Browser-side Supabase client, matching the sksports integration. It is lazy
 * so a legacy local checkout can still boot before hosted Supabase variables
 * are configured.
 */
export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;

  const url = readBrowserEnv("VITE_SUPABASE_URL");
  const publishableKey = readBrowserEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !publishableKey) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}

export const supabase = getSupabaseBrowserClient();

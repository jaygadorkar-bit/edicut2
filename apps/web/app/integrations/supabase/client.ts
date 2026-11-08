import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getSupabasePublicConfig } from "./public-config";

let browserClient: SupabaseClient<Database> | null | undefined;

/**
 * Browser-side Supabase client, matching the sksports integration. It is lazy
 * so a legacy local checkout can still boot before hosted Supabase variables
 * are configured.
 */
export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;

  const { url, publishableKey } = getSupabasePublicConfig();

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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./public-config";
import type { Database } from "./types";

let realtimeClient: SupabaseClient<Database> | null | undefined;

/** A memory-only client: application Auth tokens are supplied just-in-time. */
export function getSupabaseRealtimeClient() {
  if (realtimeClient !== undefined) return realtimeClient;

  const { url, publishableKey } = getSupabasePublicConfig();
  if (!url || !publishableKey) {
    realtimeClient = null;
    return realtimeClient;
  }

  realtimeClient = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return realtimeClient;
}

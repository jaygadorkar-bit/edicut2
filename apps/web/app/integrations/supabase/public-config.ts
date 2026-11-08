declare const __EDICUT_SUPABASE_URL__: string;
declare const __EDICUT_SUPABASE_PUBLISHABLE_KEY__: string;

/** Public Supabase values are explicitly allowlisted in vite.config.ts. */
export function getSupabasePublicConfig() {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    url: env.VITE_SUPABASE_URL || __EDICUT_SUPABASE_URL__ || undefined,
    publishableKey:
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      __EDICUT_SUPABASE_PUBLISHABLE_KEY__ ||
      undefined,
  };
}

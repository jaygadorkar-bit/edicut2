import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./types";

export type SupabaseRuntimeContext = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

type SupabaseConfig = {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
};

function runtimeEnv(context?: SupabaseRuntimeContext) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;

  return {
    ...viteEnv,
    ...nodeEnv,
    ...context?.cf?.env,
    ...context?.cloudflare?.env,
  };
}

export function getSupabaseConfig(context?: SupabaseRuntimeContext): SupabaseConfig | null {
  const env = runtimeEnv(context);
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  return {
    url,
    publishableKey,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function isSupabaseConfigured(context?: SupabaseRuntimeContext) {
  const env = runtimeEnv(context);
  return env.SUPABASE_AUTH_ENABLED !== "false" && getSupabaseConfig(context) !== null;
}

export function getSupabaseClient(
  context?: SupabaseRuntimeContext,
  accessToken?: string,
) {
  const config = getSupabaseConfig(context);
  if (!config) return null;

  return createClient<Database>(config.url, config.publishableKey, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let adminClient: SupabaseClient<Database> | undefined;
let adminClientKey: string | undefined;

/** Server-only client. Never import this module into browser components. */
export function getSupabaseAdmin(context?: SupabaseRuntimeContext) {
  const config = getSupabaseConfig(context);
  if (!config?.serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase admin operations.");
  }

  const key = `${config.url}:${config.serviceRoleKey}`;
  if (!adminClient || adminClientKey !== key) {
    adminClient = createClient<Database>(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    adminClientKey = key;
  }

  return adminClient;
}

export async function getSupabaseUserByAccessToken(
  context: SupabaseRuntimeContext | undefined,
  accessToken: string,
): Promise<User | null> {
  const client = getSupabaseClient(context, accessToken);
  if (!client) return null;

  const { data, error } = await client.auth.getUser(accessToken);
  return error || !data.user ? null : data.user;
}

export async function refreshSupabaseSession(
  context: SupabaseRuntimeContext | undefined,
  refreshToken: string,
) {
  const client = getSupabaseClient(context);
  if (!client) return null;

  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return null;

  return { session: data.session, user: data.user };
}

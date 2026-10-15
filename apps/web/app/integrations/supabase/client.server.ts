import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
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
    global: {
      fetch: fetchWithTimeout,
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    },
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
      global: { fetch: fetchWithTimeout },
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

/** Revoke this provider session before deleting its HTTP-only browser cookie. */
export async function revokeSupabaseSession(context: SupabaseRuntimeContext | undefined, accessToken: unknown, refreshToken: unknown) {
  if (typeof accessToken !== "string" || !accessToken) return;
  const client = getSupabaseClient(context);
  if (!client) throw new Error("Session revocation is unavailable.");
  if (typeof refreshToken === "string" && refreshToken) {
    // setSession refreshes expired access tokens before attempting logout.
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      if (["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired"].includes(error.code ?? "")) return;
      throw new Error("Session revocation is unavailable.");
    }
    const { error: logoutError } = await client.auth.signOut({ scope: "local" });
    if (logoutError) throw new Error("Session revocation is unavailable.");
  } else {
    const { error } = await client.auth.admin.signOut(accessToken, "local");
    if (error && ![401, 403, 404].includes(error.status ?? 0)) throw new Error("Session revocation is unavailable.");
  }
}

/**
 * Keep legacy password hashes and Supabase Auth credentials aligned for
 * admin-initiated password resets. The service-role client stays server-only.
 */
export async function updateSupabaseUserPasswordByEmail(
  context: SupabaseRuntimeContext | undefined,
  email: string,
  password: string,
  userIdHint?: string,
) {
  if (!isSupabaseConfigured(context)) return false;

  const client = getSupabaseAdmin(context);
  const authUser = await findSupabaseUserByEmail(client, email, userIdHint);
  if (!authUser) return false;
  const { error } = await client.auth.admin.updateUserById(authUser.id, { password });
  if (error) throw error;
  return true;
}

/** Apply admin-managed email corrections to the matching Auth identity. */
export async function updateSupabaseUserEmailByEmail(
  context: SupabaseRuntimeContext | undefined,
  currentEmail: string,
  newEmail: string,
  userIdHint?: string,
) {
  if (!isSupabaseConfigured(context)) return false;

  const client = getSupabaseAdmin(context);
  const authUser = await findSupabaseUserByEmail(client, currentEmail, userIdHint);
  if (!authUser) return false;
  const { error } = await client.auth.admin.updateUserById(authUser.id, {
    email: newEmail.trim().toLowerCase(),
    email_confirm: true,
  });
  if (error) throw error;
  return true;
}

/** Remove matching Auth identities before permanently deleting local accounts. */
export async function deleteSupabaseUsersByEmail(
  context: SupabaseRuntimeContext | undefined,
  emails: string[],
) {
  if (!isSupabaseConfigured(context)) return 0;

  const requestedEmails = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (!requestedEmails.size) return 0;

  const client = getSupabaseAdmin(context);
  const matches = new Map<string, string>();
  const pageSize = 1000;
  const maximumLookupPages = 50;
  for (let page = 1; page <= maximumLookupPages; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (email && requestedEmails.has(email)) matches.set(email, user.id);
    }
    if (matches.size === requestedEmails.size || data.users.length < pageSize) break;
    if (page === maximumLookupPages) throw new Error("Supabase user lookup reached its safety limit.");
  }

  for (const userId of matches.values()) {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
  return matches.size;
}

async function findSupabaseUserByEmail(
  client: SupabaseClient<Database>,
  email: string,
  userIdHint?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (userIdHint) {
    const { data } = await client.auth.admin.getUserById(userIdHint);
    if (data.user?.email?.trim().toLowerCase() === normalizedEmail) return data.user;
  }

  const pageSize = 1000;
  const maximumLookupPages = 50;
  for (let page = 1; page <= maximumLookupPages; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    const authUser = data.users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (authUser) return authUser;
    if (data.users.length < pageSize) return null;
  }
  throw new Error("Supabase user lookup reached its safety limit.");
}

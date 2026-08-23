import type { AuthResponse, Session, User } from "@supabase/supabase-js";
import {
  getSupabaseAdmin,
  getSupabaseConfig,
  getSupabaseClient,
  isSupabaseConfigured,
  type SupabaseRuntimeContext,
} from "./client.server";

type AuthResult = {
  user: User | null;
  session: Session | null;
  error?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Supabase authentication failed.";
}

async function syncUserProfile(
  context: SupabaseRuntimeContext | undefined,
  user: User,
  name?: string,
) {
  const admin = getSupabaseAdmin(context);
  const { data: existing, error: lookupError } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return;

  const { error } = await admin.from("users").insert({
    id: user.id,
    email: user.email ?? "",
    name: name ?? (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null),
    profile_image_url:
      typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
  });

  if (error) throw error;
}

export function supabaseAuthEnabled(context?: SupabaseRuntimeContext) {
  return isSupabaseConfigured(context) && Boolean(getSupabaseConfig(context)?.serviceRoleKey);
}

export async function signUpWithSupabase({
  context,
  email,
  password,
  name,
}: {
  context?: SupabaseRuntimeContext;
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResult> {
  const client = getSupabaseClient(context);
  if (!client) return { user: null, session: null, error: "Supabase is not configured." };

  const response: AuthResponse = await client.auth.signUp({
    email,
    password,
    options: {
      data: name ? { name } : undefined,
    },
  });

  if (response.error) return { user: null, session: null, error: response.error.message };
  if (response.data.user) {
    await syncUserProfile(context, response.data.user, name);
  }

  return {
    user: response.data.user,
    session: response.data.session,
  };
}

export async function signInWithSupabase({
  context,
  email,
  password,
}: {
  context?: SupabaseRuntimeContext;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const client = getSupabaseClient(context);
  if (!client) return { user: null, session: null, error: "Supabase is not configured." };

  const response = await client.auth.signInWithPassword({ email, password });
  if (response.error) return { user: null, session: null, error: response.error.message };
  if (response.data.user) {
    await syncUserProfile(context, response.data.user);
  }

  return {
    user: response.data.user,
    session: response.data.session,
  };
}

export function isSupabaseAuthError(error?: string) {
  return Boolean(error && !error.includes("not configured"));
}

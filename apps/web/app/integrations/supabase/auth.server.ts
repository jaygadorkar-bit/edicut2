import type { AuthResponse, Session, User } from "@supabase/supabase-js";
import { users } from "@edicut/db/schema";
import { findUserByEmail, findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../../lib/db.server";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  type SupabaseRuntimeContext,
} from "./client.server";

type AuthResult = {
  user: User | null;
  session: Session | null;
  profileId?: string;
  error?: string;
};

async function syncUserProfile(
  context: SupabaseRuntimeContext | undefined,
  user: User,
  name?: string,
) {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Your account must have an email address.");
  const db = getDbFromContext(context ?? {});
  const existing = await findUserById(db, user.id) ?? await findUserByEmail(db, email);
  if (existing) {
    if (!existing.active || existing.deletedAt) {
      throw new Error("This account is unavailable. Contact EdiCut support.");
    }
    if (existing.email.toLowerCase() !== email || (existing.id !== user.id && !user.email_confirmed_at)) {
      throw new Error("Confirm your email before linking this account.");
    }
    // Preserve local IDs, ownership, roles and account restrictions.
    return existing.id;
  }

  await db.insert(users).values({
    id: user.id,
    email,
    name: name ?? (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null),
    profileImageUrl:
      typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
    role: "customer",
  });
  return user.id;
}

export function supabaseAuthEnabled(context?: SupabaseRuntimeContext) {
  return isSupabaseConfigured(context);
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
  let profileId: string | undefined;
  if (response.data.user && response.data.session) {
    try {
      profileId = await syncUserProfile(context, response.data.user, name);
    } catch (error) {
      return profileSyncFailure(error);
    }
  }

  return {
    user: response.data.user,
    session: response.data.session,
    profileId,
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
  let profileId: string | undefined;
  if (response.data.user && response.data.session) {
    try {
      profileId = await syncUserProfile(context, response.data.user);
    } catch (error) {
      return profileSyncFailure(error);
    }
  }

  return {
    user: response.data.user,
    session: response.data.session,
    profileId,
  };
}

function profileSyncFailure(error: unknown): AuthResult {
  const knownMessages = [
    "Your account must have an email address.",
    "This account is unavailable. Contact EdiCut support.",
    "Confirm your email before linking this account.",
  ];
  return {
    user: null,
    session: null,
    error: error instanceof Error && knownMessages.includes(error.message)
      ? error.message
      : "Your account could not be opened. Please try again shortly.",
  };
}

export function isSupabaseAuthError(error?: string) {
  return Boolean(error && !error.includes("not configured"));
}

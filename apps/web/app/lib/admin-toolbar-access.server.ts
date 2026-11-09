import type { DatabaseClient } from "@edicut/db/client";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findUserById } from "@edicut/db/repositories/users";
import { hasCurrentSessionCredentials, isAdminRole, type SessionContext } from "./session.server";
import { getSupabaseUserByAccessToken } from "../integrations/supabase/client.server";
import { retryDatabaseRead } from "./database-errors";

export type AdminToolbarAccess = "none" | "verified";

/** Show admin controls only for an authenticated, currently authorized administrator. */
export async function getAdminToolbarAccess(db: DatabaseClient, identity: {
  userId?: unknown;
  userCredentialVersion?: unknown;
  userAccessToken?: unknown;
  adminUserId?: unknown;
  adminCredentialVersion?: unknown;
  adminAccessToken?: unknown;
  verifiedUserAdminId?: unknown;
  verifiedUserAdminCredentialVersion?: unknown;
}, context?: SessionContext): Promise<AdminToolbarAccess> {
  try {
    return await verifyAdminToolbarAccess(db, identity, context);
  } catch {
    // Toolbar availability must not block the workspace. The admin routes
    // independently validate access, and the toolbar stays hidden on error.
    console.error("Admin toolbar identity could not be verified.");
    return "none";
  }
}

async function verifyAdminToolbarAccess(
  db: DatabaseClient,
  identity: Parameters<typeof getAdminToolbarAccess>[1],
  context?: SessionContext,
): Promise<AdminToolbarAccess> {
  if (typeof identity.adminUserId === "string" && identity.adminUserId) {
    const id = identity.adminUserId;
    const admin = await retryDatabaseRead(() => findAdminUserById(db, id));
    if (admin?.active && isAdminRole(admin.role) && await hasCurrentSessionCredentials(identity.adminCredentialVersion, admin, context, "admin")
      && await validProviderIdentity(identity.adminAccessToken, admin.email, context)) return "verified";
  }
  if (typeof identity.userId !== "string" || !identity.userId ||
      typeof identity.verifiedUserAdminId !== "string" || !identity.verifiedUserAdminId) return "none";
  const { userId, verifiedUserAdminId } = identity;
  const [user, admin] = await Promise.all([
    retryDatabaseRead(() => findUserById(db, userId)),
    retryDatabaseRead(() => findAdminUserById(db, verifiedUserAdminId)),
  ]);
  if (!user?.active || user.deletedAt || !admin?.active || !isAdminRole(admin.role)) return "none";
  return user.email.trim().toLowerCase() === admin.email.trim().toLowerCase()
    && await hasCurrentSessionCredentials(identity.userCredentialVersion, user, context)
    && await hasCurrentSessionCredentials(identity.verifiedUserAdminCredentialVersion, admin, context, "admin")
    && await validProviderIdentity(identity.userAccessToken, user.email, context) ? "verified" : "none";
}

async function validProviderIdentity(token: unknown, email: string, context?: SessionContext) {
  if (token === undefined) return true;
  if (typeof token !== "string" || !token) return false;
  const user = await getSupabaseUserByAccessToken(context, token);
  return Boolean(user?.email_confirmed_at && user.email?.trim().toLowerCase() === email.trim().toLowerCase());
}

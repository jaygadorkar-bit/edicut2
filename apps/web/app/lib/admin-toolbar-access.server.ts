import type { DatabaseClient } from "@edicut/db/client";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findUserById } from "@edicut/db/repositories/users";
import { hasCurrentSessionCredentials, isAdminRole, type SessionContext } from "./session.server";
import { getSupabaseUserByAccessToken } from "../integrations/supabase/client.server";

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
  if (typeof identity.adminUserId === "string" && identity.adminUserId) {
    const admin = await findAdminUserById(db, identity.adminUserId);
    if (admin?.active && isAdminRole(admin.role) && await hasCurrentSessionCredentials(identity.adminCredentialVersion, admin, context, "admin")
      && await validProviderIdentity(identity.adminAccessToken, admin.email, context)) return "verified";
  }
  if (typeof identity.userId !== "string" || !identity.userId ||
      typeof identity.verifiedUserAdminId !== "string" || !identity.verifiedUserAdminId) return "none";
  const [user, admin] = await Promise.all([
    findUserById(db, identity.userId),
    findAdminUserById(db, identity.verifiedUserAdminId),
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

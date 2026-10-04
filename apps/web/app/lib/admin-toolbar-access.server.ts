import type { DatabaseClient } from "@edicut/db/client";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findUserById } from "@edicut/db/repositories/users";
import { isAdminRole } from "./session.server";

export type AdminToolbarAccess = "none" | "verified";

/** Show admin controls only for an authenticated, currently authorized administrator. */
export async function getAdminToolbarAccess(db: DatabaseClient, identity: {
  userId?: unknown;
  adminUserId?: unknown;
  verifiedUserAdminId?: unknown;
}): Promise<AdminToolbarAccess> {
  if (typeof identity.adminUserId === "string" && identity.adminUserId) {
    const admin = await findAdminUserById(db, identity.adminUserId);
    if (admin?.active && isAdminRole(admin.role)) return "verified";
  }
  if (typeof identity.userId !== "string" || !identity.userId ||
      typeof identity.verifiedUserAdminId !== "string" || !identity.verifiedUserAdminId) return "none";
  const [user, admin] = await Promise.all([
    findUserById(db, identity.userId),
    findAdminUserById(db, identity.verifiedUserAdminId),
  ]);
  if (!user?.active || user.deletedAt || !admin?.active || !isAdminRole(admin.role)) return "none";
  return user.email.trim().toLowerCase() === admin.email.trim().toLowerCase() ? "verified" : "none";
}

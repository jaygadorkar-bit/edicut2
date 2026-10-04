import type { DatabaseClient } from "@edicut/db/client";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findUserById } from "@edicut/db/repositories/users";
import { redirect } from "react-router";
import type { LoaderContext } from "../types";
import { destroySession, getAdminSession, getSession, isAdminRole, requireAdminUser, requireUserId } from "./session.server";
import { getRoleFeatureAccessSettings } from "./site-settings.server";
import { getAllowedDashboardFeatures, getDashboardLandingPath, type DashboardFeature } from "./role-feature-access";

export async function requireContactInboxAccess(request: Request, db: DatabaseClient, context?: LoaderContext) {
  const cookie = request.headers.get("Cookie");
  const [adminSession, session] = await Promise.all([getAdminSession(cookie, context), getSession(cookie, context)]);

  if (typeof adminSession.get("adminUserId") === "string" && adminSession.get("adminUserId")) {
    const admin = await requireAdminUser(request, db, context);
    return { db, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin", profileImageUrl: null }, allowedFeatures: ["support"] as DashboardFeature[] };
  }

  const userId = await requireUserId(request, context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) {
    throw redirect("/signin?redirectTo=/dashboard/messages", { headers: { "Set-Cookie": await destroySession(session, context) } });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  const adminId = session.get("adminUserId");
  if (session.get("adminAccessVerified") === true && typeof adminId === "string" && adminId) {
    const admin = await findAdminUserById(db, adminId);
    if (admin?.active && isAdminRole(admin.role) && admin.email.trim().toLowerCase() === user.email.trim().toLowerCase()) {
      return { db, user: { ...user, role: "admin" }, allowedFeatures: Array.from(new Set<DashboardFeature>([...allowedFeatures, "support"])) };
    }
  }

  if (!allowedFeatures.includes("support")) throw redirect(getDashboardLandingPath(allowedFeatures));
  return { db, user, allowedFeatures };
}

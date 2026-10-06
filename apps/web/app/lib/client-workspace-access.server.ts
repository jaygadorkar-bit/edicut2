import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "./db.server";
import { destroySession, getSession, requireUserId } from "./session.server";
import { getRoleFeatureAccessSettings } from "./site-settings.server";
import { canAccessDashboardFeature, getAllowedDashboardFeatures, getDashboardLandingPath } from "./role-feature-access";
import { toPublicUser } from "./admin-public";

export async function requireClientWorkspace({ request, context }: Pick<LoaderFunctionArgs, "request" | "context">) {
  const userId = await requireUserId(request, context, new URL(request.url).pathname);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", { headers: { "Set-Cookie": await destroySession(session, context) } });
  }
  const access = await getRoleFeatureAccessSettings(db, context);
  const features = getAllowedDashboardFeatures(user.role, access);
  if (!canAccessDashboardFeature(user.role, "projects", access)) throw redirect(getDashboardLandingPath(features));
  return { db, userId, user: toPublicUser(user), features };
}

import type { LoaderFunctionArgs } from "react-router";
import { getAdminNavigationCounts } from "../lib/admin-navigation-counts.server";
import { getAdminToolbarAccess } from "../lib/admin-toolbar-access.server";
import { getDbFromContext } from "../lib/db.server";
import { getAdminSession, getSession } from "../lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const cookie = request.headers.get("Cookie");
  const [session, adminSession] = await Promise.all([getSession(cookie, context), getAdminSession(cookie, context)]);
  const userId = session.get("userId");
  const adminUserId = adminSession.get("adminUserId");
  if (!userId && !adminUserId) return Response.json({ error: "Permission denied" }, { status: 403, headers });
  const db = getDbFromContext(context);
  const access = await getAdminToolbarAccess(db, {
    userId,
    adminUserId,
    verifiedUserAdminId: session.get("adminAccessVerified") === true ? session.get("adminUserId") : undefined,
  });
  if (access !== "verified") return Response.json({ error: "Permission denied" }, { status: 403, headers });
  return Response.json(await getAdminNavigationCounts(db), { headers });
}

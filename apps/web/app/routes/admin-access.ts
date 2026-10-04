import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import {
  commitAdminSession,
  getAdminSession,
  getSession,
  requireUserId,
  isAdminRole,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "../lib/admin-paths";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith(ADMIN_BASE_PATH) || value.startsWith(ADMIN_LOGIN_PATH) || value.includes("//")) {
    return ADMIN_BASE_PATH;
  }

  return value;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const existingAdminSession = await getAdminSession(request.headers.get("Cookie"), context);

  if (typeof existingAdminSession.get("adminUserId") === "string") {
    return redirect(returnTo);
  }

  const userId = await requireUserId(request, context, ADMIN_BASE_PATH);
  const userSession = await getSession(request.headers.get("Cookie"), context);
  const adminUserId = userSession.get("adminUserId");
  if (
    userSession.get("adminAccessVerified") !== true ||
    typeof adminUserId !== "string" ||
    !adminUserId
  ) {
    return redirect("/dashboard");
  }

  const db = getDbFromContext(context);
  const [user, adminUser] = await Promise.all([
    findUserById(db, userId),
    findAdminUserById(db, adminUserId),
  ]);

  if (
    !user?.active ||
    user.deletedAt ||
    !adminUser?.active ||
    !isAdminRole(adminUser.role) ||
    user.email?.trim().toLowerCase() !== adminUser.email.trim().toLowerCase()
  ) {
    return redirect("/dashboard");
  }

  existingAdminSession.set("adminUserId", adminUser.id);

  return redirect(returnTo, {
    headers: {
      "Set-Cookie": await commitAdminSession(existingAdminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export default function AdminAccessRoute() {
  return null;
}

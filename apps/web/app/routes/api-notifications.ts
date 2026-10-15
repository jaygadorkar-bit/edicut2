import type { LoaderFunctionArgs } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser, requireUserId } from "../lib/session.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { getAllowedDashboardFeatures } from "../lib/role-feature-access";
import {
  getWorkspaceNotificationFeed,
  type NotificationViewer,
} from "../lib/notifications.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== "admin" && scope !== "client")
      return Response.json(
        { error: "Invalid notification scope." },
        { status: 400, headers },
      );
    const db = getDbFromContext(context);
    let viewer: NotificationViewer;
    if (scope === "admin") {
      const admin = await requireAdminUser(request, db, context);
      if (!admin.active || admin.role !== "admin")
        return Response.json(
          { error: "Permission denied." },
          { status: 403, headers },
        );
      viewer = { id: admin.id, admin: true, role: "admin", features: [] };
    } else {
      const id = await requireUserId(request, context);
      const user = await findUserById(db, id);
      if (!user?.active || user.deletedAt)
        return Response.json(
          { error: "Permission denied." },
          { status: 403, headers },
        );
      const settings = await getRoleFeatureAccessSettings(db, context);
      viewer = {
        id,
        admin: false,
        role: user.role,
        features: getAllowedDashboardFeatures(user.role, settings),
      };
    }
    const limit = await consumeUsageLimit({
      request,
      context,
      bindingName: "USER_ACTION_LIMITER",
      key: `notifications:${viewer.admin ? "admin" : "user"}:${viewer.id}`,
      localLimit: 30,
      localPeriodSeconds: 60,
    });
    if (limit !== "allowed")
      return Response.json(
        { error: "Please wait a moment before refreshing." },
        { status: 429, headers: { ...headers, "Retry-After": "30" } },
      );
    return Response.json(await getWorkspaceNotificationFeed(db, viewer), {
      headers,
    });
  } catch (error) {
    if (error instanceof Response) {
      if (error.status >= 300 && error.status < 400) {
        // The existing auth helper replays this request after refreshing its cookie.
        const target = error.headers.get("Location");
        if (
          target &&
          new URL(target, request.url).href === request.url &&
          error.headers.has("Set-Cookie")
        ) {
          const refreshHeaders = new Headers(error.headers);
          for (const [key, value] of Object.entries(headers))
            refreshHeaders.set(key, value);
          return new Response(null, {
            status: error.status,
            headers: refreshHeaders,
          });
        }
        return Response.json(
          { error: "Sign in again to view notifications." },
          {
            status: 401,
            headers: {
              ...headers,
              ...(error.headers.get("Set-Cookie")
                ? { "Set-Cookie": error.headers.get("Set-Cookie")! }
                : {}),
            },
          },
        );
      }
      return Response.json(
        { error: "Notifications are unavailable for this account." },
        { status: error.status, headers },
      );
    }
    return Response.json(
      { error: "Notifications couldn’t load. Please try again." },
      { status: 503, headers },
    );
  }
}

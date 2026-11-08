import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser, requireUserId } from "../lib/session.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { getAllowedDashboardFeatures } from "../lib/role-feature-access";
import {
  getWorkspaceNotificationFeed,
  importAdminWorkspaceEventReads,
  importUserWorkspaceEventReads,
  setAdminWorkspaceEventsRead,
  setUserWorkspaceEventsRead,
  type NotificationViewer,
  type WorkspaceEventReadReceipt,
} from "../lib/notifications.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
import { sendWorkspaceReceiptInvalidation } from "../lib/notification-realtime.server";

async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError("Request body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

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

/** Update or import read receipts for the authenticated workspace viewer. */
export async function action({ request, context }: ActionFunctionArgs) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    if (request.method !== "PATCH")
      return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "PATCH" } });
    if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site")
      return Response.json({ error: "Send changes from this site." }, { status: 403, headers });
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      return Response.json({ error: "Submit JSON event IDs." }, { status: 415, headers });
    if (Number(request.headers.get("Content-Length") || 0) > 24_576)
      return Response.json({ error: "Request is too large." }, { status: 413, headers });
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    if (scope !== "admin" && scope !== "client")
      return Response.json({ error: "Invalid notification scope." }, { status: 400, headers });

    const db = getDbFromContext(context);
    let viewer: NotificationViewer;
    if (scope === "admin") {
      const admin = await requireAdminUser(request, db, context);
      if (!admin.active || admin.role !== "admin")
        return Response.json({ error: "Permission denied." }, { status: 403, headers });
      viewer = { id: admin.id, admin: true, role: "admin", features: [] };
    } else {
      const id = await requireUserId(request, context);
      const user = await findUserById(db, id);
      if (!user?.active || user.deletedAt)
        return Response.json({ error: "Permission denied." }, { status: 403, headers });
      const settings = await getRoleFeatureAccessSettings(db, context);
      viewer = { id, admin: false, role: user.role, features: getAllowedDashboardFeatures(user.role, settings) };
    }
    const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `notifications:${scope}:${viewer.id}`, localLimit: 30, localPeriodSeconds: 60 });
    if (limit !== "allowed")
      return Response.json({ error: "Please wait a moment before refreshing." }, { status: 429, headers: { ...headers, "Retry-After": "30" } });

    let payload: unknown;
    try { payload = await readBoundedJson(request, 24_576); } catch (error) {
      return Response.json({ error: error instanceof RangeError ? "Request is too large." : "Invalid request body." }, { status: error instanceof RangeError ? 413 : 400, headers });
    }
    const data = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as { eventIds?: unknown; read?: unknown; identity?: unknown; legacyReads?: unknown }
      : undefined;
    if (data && Object.hasOwn(data, "legacyReads")) {
      const legacyReads = data.legacyReads;
      if (data.identity !== `${scope === "admin" ? "admin" : "user"}:${viewer.id}`)
        return Response.json({ error: "Read receipts belong to a different account." }, { status: 403, headers });
      if (!Array.isArray(legacyReads) || legacyReads.length > 100 || legacyReads.some((receipt) =>
        !receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
        typeof (receipt as { eventId?: unknown }).eventId !== "string" ||
        (receipt as { eventId: string }).eventId.length < 1 ||
        (receipt as { eventId: string }).eventId.length > 180 ||
        typeof (receipt as { readAt?: unknown }).readAt !== "string" ||
        !Number.isFinite(Date.parse((receipt as { readAt: string }).readAt))))
        return Response.json({ error: "Invalid read receipts." }, { status: 400, headers });

      const feed = await getWorkspaceNotificationFeed(db, viewer);
      const availableIds = new Set(feed.events.map((event) => event.id));
      const now = Date.now();
      const safeReceipts = (legacyReads as WorkspaceEventReadReceipt[]).filter((receipt) => {
        const readAt = Date.parse(receipt.readAt);
        return availableIds.has(receipt.eventId) && readAt <= now && readAt >= now - 90 * 86_400_000;
      });
      const eventIds = viewer.admin
        ? await importAdminWorkspaceEventReads(db, viewer.id, safeReceipts)
        : await importUserWorkspaceEventReads(db, viewer.id, safeReceipts);
      if (eventIds.length) await sendWorkspaceReceiptInvalidation(context, viewer);
      return Response.json({ eventIds }, { headers });
    }
    const eventIds = data?.eventIds;
    const read = data?.read;
    if (typeof read !== "boolean" || !Array.isArray(eventIds) || eventIds.length > 100 || eventIds.some((id) => typeof id !== "string" || id.length < 1 || id.length > 180))
      return Response.json({ error: "Invalid event IDs." }, { status: 400, headers });

    const feed = await getWorkspaceNotificationFeed(db, viewer);
    const availableIds = new Set(feed.events.map((event) => event.id));
    const safeIds = [...new Set(eventIds as string[])].filter((id) => availableIds.has(id));
    const result = viewer.admin
      ? await setAdminWorkspaceEventsRead(db, viewer.id, safeIds, read)
      : await setUserWorkspaceEventsRead(db, viewer.id, safeIds, read);
    if (result.eventIds.length) await sendWorkspaceReceiptInvalidation(context, viewer);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof Response) {
      if (error.status >= 300 && error.status < 400) {
        const target = error.headers.get("Location");
        if (target && new URL(target, request.url).href === request.url && error.headers.has("Set-Cookie")) {
          const refreshHeaders = new Headers(error.headers);
          for (const [key, value] of Object.entries(headers)) refreshHeaders.set(key, value);
          return new Response(null, { status: error.status, headers: refreshHeaders });
        }
        return Response.json({ error: "Sign in again to update notifications." }, { status: 401, headers });
      }
      return Response.json({ error: "Notifications are unavailable for this account." }, { status: error.status, headers });
    }
    return Response.json({ error: "Notifications couldn’t be updated. Please try again." }, { status: 503, headers });
  }
}

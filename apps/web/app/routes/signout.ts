import { redirect, type ActionFunctionArgs } from "react-router";
import { destroyAdminSession, destroySession, getAdminSession, getSession } from "../lib/session.server";

// Visiting a link must never sign someone out; only the submitted form does.
export function loader() {
  return redirect("/signin?mode=signin");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const origin = request.headers.get("Origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const cookie = request.headers.get("Cookie");
  const [session, adminSession] = await Promise.all([
    getSession(cookie, context),
    getAdminSession(cookie, context),
  ]);
  const [userCookie, adminCookie] = await Promise.all([
    destroySession(session, context),
    destroyAdminSession(adminSession, context),
  ]);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", userCookie);
  headers.append("Set-Cookie", adminCookie);
  return redirect("/signin?mode=signin", { headers });
}

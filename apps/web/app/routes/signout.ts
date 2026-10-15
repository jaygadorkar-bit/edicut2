import { redirect, type ActionFunctionArgs } from "react-router";
import { destroyAdminSession, destroySession, getAdminSession, getSession, revokeAuthenticatedSessions } from "../lib/session.server";
import { forbiddenMutation, isSameSiteMutation } from "../lib/mutation-request.server";

// Visiting a link must never sign someone out; only the submitted form does.
export function loader() {
  return redirect("/signin?mode=signin");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  if (!isSameSiteMutation(request)) return forbiddenMutation();

  const cookie = request.headers.get("Cookie");
  const [session, adminSession] = await Promise.all([
    getSession(cookie, context),
    getAdminSession(cookie, context),
  ]);
  try {
    await revokeAuthenticatedSessions(session, adminSession, context);
  } catch {
    return new Response("Sign-out could not be completed. Please try again.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const [userCookie, adminCookie] = await Promise.all([
    destroySession(session, context),
    destroyAdminSession(adminSession, context),
  ]);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", userCookie);
  headers.append("Set-Cookie", adminCookie);
  return redirect("/signin?mode=signin", { headers });
}

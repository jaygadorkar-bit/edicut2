import { describe, expect, it } from "vitest";
import { action, loader } from "./signout";
import { commitAdminSession, commitSession, getAdminSession, getSession } from "../lib/session.server";

const context = { cloudflare: { env: { SESSION_SECRET: "signout-test-only-secret" } } };
const url = "http://localhost:3002/signout";
const routeArgs = { context, params: {}, url: new URL(url), pattern: "/signout" };

describe("toolbar sign out", () => {
  it("expires both signed browser sessions in separate cookie headers", async () => {
    const session = await getSession(null, context);
    session.set("userId", "test-user");
    session.set("adminUserId", "test-admin");
    const adminSession = await getAdminSession(null, context);
    adminSession.set("adminUserId", "test-admin");
    const cookie = [
      await commitSession(session, undefined, context),
      await commitAdminSession(adminSession, undefined, context),
    ].map((value) => value.split(";")[0]).join("; ");

    const response = await action({
      request: new Request(url, { method: "POST", headers: { Cookie: cookie, Origin: new URL(url).origin } }),
      ...routeArgs,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signin?mode=signin");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.some((value) => value.startsWith("_session=;") && value.includes("Expires=Thu, 01 Jan 1970"))).toBe(true);
    expect(cookies.some((value) => value.startsWith("_edicut_admin=;") && value.includes("Expires=Thu, 01 Jan 1970"))).toBe(true);
  });

  it("does not sign out on GET", () => {
    const response = loader();
    expect(response.headers.get("Location")).toBe("/signin?mode=signin");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it.each([
    ["Origin", "https://other.example"],
    ["Sec-Fetch-Site", "cross-site"],
  ])("rejects cross-site form submissions: %s = %s", async (name, value) => {
    const response = await action({ request: new Request(url, { method: "POST", headers: { [name]: value } }), ...routeArgs });
    expect(response.status).toBe(403);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it("rejects other mutation methods", async () => {
    const response = await action({ request: new Request(url, { method: "DELETE" }), ...routeArgs });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});

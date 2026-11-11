import { describe, expect, it } from "vitest";
import { getGoogleOAuthCookie, issueAuthCsrfToken } from "../lib/session.server";
import { action, loader } from "./admin-google-login";

const appUrl = "http://localhost:3002";
const context = { cf: { env: {
  NODE_ENV: "development",
  SESSION_SECRET: "test-session-secret",
  APP_URL: appUrl,
  AUTH_GOOGLE_ID: "test-client-id",
  AUTH_GOOGLE_SECRET: "test-client-secret",
} } };

async function csrf() {
  const response = await issueAuthCsrfToken(new Request(`${appUrl}/site/node-logmin/login`), context);
  if (!response.setCookie) throw new Error("Expected a new CSRF cookie.");
  return { token: response.token, cookie: response.setCookie.split(";")[0] };
}

async function post(returnTo = "/site/node-logmin/marketing-content", token?: string, origin = appUrl) {
  const issued = await csrf();
  const request = new Request(`${appUrl}/site/node-logmin/login/google`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: issued.cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrfToken: token ?? issued.token, returnTo }),
  });
  return { issued, request };
}

describe("admin Google sign-in initiation", () => {
  it("returns GET requests to the admin login screen", async () => {
    const response = loader({ request: new Request(`${appUrl}/site/node-logmin/login/google`), context, params: {} } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`${appUrl}/site/node-logmin/login`);
  });

  it("rejects cross-origin starts", async () => {
    const { request } = await post("/site/node-logmin/marketing-content", undefined, "https://evil.example");
    const response = await action({ request, context, params: {} } as never);
    expect(response.status).toBe(403);
  });

  it("requires the admin page's CSRF token", async () => {
    const { request } = await post("/site/node-logmin/marketing-content", "0".repeat(64));
    const response = await action({ request, context, params: {} } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`${appUrl}/site/node-logmin/login?error=auth-request&redirectTo=%2Fsite%2Fnode-logmin%2Fmarketing-content`);
  });

  it("starts a PKCE admin transaction and keeps the return path inside the admin area", async () => {
    const { request } = await post();
    const response = await action({ request, context, params: {} } as never);
    expect(response.status).toBe(303);

    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);

    const transaction = await getGoogleOAuthCookie(context).parse(response.headers.get("Set-Cookie"));
    expect(transaction?.mode).toBe("admin");
    expect(transaction?.returnTo).toBe("/site/node-logmin/marketing-content");
  });

  it("replaces an external return path with the admin home", async () => {
    const { request } = await post("https://evil.example/steal");
    const response = await action({ request, context, params: {} } as never);
    const transaction = await getGoogleOAuthCookie(context).parse(response.headers.get("Set-Cookie"));
    expect(transaction?.mode).toBe("admin");
    expect(transaction?.returnTo).toBe("/site/node-logmin");
  });
});

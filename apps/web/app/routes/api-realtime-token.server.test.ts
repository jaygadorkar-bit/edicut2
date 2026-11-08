import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  userId: vi.fn(),
  user: vi.fn(),
  adminSession: vi.fn(),
  session: vi.fn(),
  limit: vi.fn(),
  db: {},
}));
vi.mock("../lib/session.server", () => ({
  getAdminSession: mocks.adminSession,
  getSession: mocks.session,
  requireAdminUser: mocks.admin,
  requireUserId: mocks.userId,
}));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.limit }));
import { loader } from "./api-realtime-token";

function makeToken(email: string) {
  const payload = btoa(JSON.stringify({ sub: "auth-user-id", email, exp: Math.floor(Date.now() / 1_000) + 600 }))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `header.${payload}.signature`;
}

const args = (scope = "client", headers?: HeadersInit) => ({
  request: new Request(`http://localhost:3002/api/realtime-token?scope=${scope}`, { headers }),
  context: {},
  params: {},
  url: new URL("http://localhost:3002/api/realtime-token"),
  pattern: "/api/realtime-token",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin-id", email: "admin@example.test", active: true, role: "admin" });
  mocks.userId.mockResolvedValue("client-id");
  mocks.user.mockResolvedValue({ id: "client-id", email: "client@example.test", active: true, deletedAt: null });
  mocks.adminSession.mockResolvedValue({ get: (key: string) => key === "supabaseAccessToken" ? makeToken("admin@example.test") : undefined });
  mocks.session.mockResolvedValue({ get: (key: string) => key === "supabaseAccessToken" ? makeToken("client@example.test") : undefined });
  mocks.limit.mockResolvedValue("allowed");
});

describe("private Realtime token endpoint", () => {
  it("returns only a user's verified access token and server-derived private topic", async () => {
    const response = await loader(args());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json() as { accessToken?: string; topic?: string; expiresAt?: number };
    expect(body.topic).toBe("edicut:user:client-id");
    expect(body.accessToken).toMatch(/^header\..+\.signature$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ key: "realtime-token:client:client-id" }));
  });

  it("uses the verified admin session and a distinct admin topic", async () => {
    const response = await loader(args("admin"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ topic: "edicut:admin:admin-id" });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.userId).not.toHaveBeenCalled();
  });

  it("does not issue a Realtime token when the Supabase email does not match the profile", async () => {
    mocks.session.mockResolvedValue({ get: () => makeToken("attacker@example.test") });
    const response = await loader(args());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("keeps legacy local-password accounts on the authenticated HTTP fallback", async () => {
    mocks.session.mockResolvedValue({ get: () => undefined });
    expect((await loader(args())).status).toBe(204);
  });

  it("rejects unsupported scopes and cross-origin requests before authentication", async () => {
    expect((await loader(args("everyone"))).status).toBe(400);
    expect((await loader(args("client", { Origin: "https://attacker.example" }))).status).toBe(403);
    expect(mocks.userId).not.toHaveBeenCalled();
  });

  it("honors rate limits and never returns a token to an expired session", async () => {
    mocks.limit.mockResolvedValue("limited");
    expect((await loader(args())).status).toBe(429);
    mocks.limit.mockResolvedValue("allowed");
    mocks.userId.mockRejectedValue(new Response(null, { status: 302, headers: { Location: "/signin" } }));
    expect((await loader(args())).status).toBe(401);
  });

  it("logs only a database error code when live token setup fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.userId.mockRejectedValue(new Error("private query details", { cause: { code: "42703", message: "private database details" } }));

    const response = await loader(args());

    expect(response.status).toBe(503);
    expect(errorLog).toHaveBeenCalledWith("Realtime token bootstrap failed.", { code: "42703" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private");
    errorLog.mockRestore();
  });
});

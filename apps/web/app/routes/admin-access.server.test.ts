import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), user: vi.fn() }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.admin }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));

import { loader } from "./admin-access";
import { commitSession, getAdminSession, getSession } from "../lib/session.server";
import { ADMIN_ACCESS_PATH, ADMIN_BASE_PATH } from "../lib/admin-paths";

const context = { cloudflare: { env: { SESSION_SECRET: "admin-access-test-only-secret" } } };
const admin = { id: "admin-1", email: "owner@example.com", role: "admin", active: true };
const user = { id: "user-1", email: admin.email, role: "customer", active: true, deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(admin);
  mocks.user.mockResolvedValue(user);
});

async function openPanel(verified: boolean) {
  const session = await getSession(null, context);
  session.set("userId", user.id);
  session.set("adminUserId", admin.id);
  if (verified) session.set("adminAccessVerified", true);
  const cookie = (await commitSession(session, undefined, context)).split(";")[0];
  const request = new Request(`http://localhost:3002${ADMIN_ACCESS_PATH}`, { headers: { Cookie: cookie } });
  return loader({ request, context, params: {} } as Parameters<typeof loader>[0]);
}

describe("verified workspace admin panel access", () => {
  it("opens the panel without another sign-in and creates the dedicated admin session", async () => {
    const response = await openPanel(true);
    expect(response.headers.get("Location")).toBe(ADMIN_BASE_PATH);
    const adminSession = await getAdminSession(response.headers.get("Set-Cookie"), context);
    expect(adminSession.get("adminUserId")).toBe(admin.id);
  });

  it("does not promote an unverified workspace session based on an email match", async () => {
    const response = await openPanel(false);
    expect(response.headers.get("Location")).toBe("/dashboard");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    { ...user, active: false },
    { ...user, deletedAt: new Date() },
    { ...user, email: "different@example.com" },
    undefined,
  ])("denies inactive, deleted, mismatched, or missing workspace accounts: %j", async (record) => {
    mocks.user.mockResolvedValue(record);
    const response = await openPanel(true);
    expect(response.headers.get("Location")).toBe("/dashboard");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it.each([{ ...admin, active: false }, { ...admin, role: "customer" }, undefined])(
    "denies revoked, non-admin, or missing administrators: %j", async (record) => {
      mocks.admin.mockResolvedValue(record);
      const response = await openPanel(true);
      expect(response.headers.get("Location")).toBe("/dashboard");
      expect(response.headers.has("Set-Cookie")).toBe(false);
    },
  );
});

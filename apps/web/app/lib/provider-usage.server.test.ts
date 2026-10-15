import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), databaseUrl: "", driveQuota: vi.fn() }));
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithTimeout: mocks.fetch }));
vi.mock("./db.server", () => ({ getDatabaseUrlFromContext: () => mocks.databaseUrl }));
vi.mock("./google-drive-storage.server", () => ({ getGoogleDriveStorageQuota: mocks.driveQuota }));
vi.mock("node:fs/promises", () => ({ readFile: async () => { throw new Error("No local files in this fixture"); } }));
import { getProviderUsageOverview } from "./provider-usage.server";

const env = Object.fromEntries([
  "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID", "CF_ZONE_ID", "CLOUDFLARE_ZONE_NAME", "CLOUDFLARE_WORKER_NAME",
  "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CLOUDFLARE_EMAIL", "CF_EMAIL", "CLOUDFLARE_API_KEY", "CF_API_KEY", "VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_ORG_ID",
  "NEON_API_KEY", "NEON_PROJECT_ID", "DATABASE_PROJECT_ID", "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
].map(key => [key, ""]));
const context = { cf: { env: { ...env, SUPABASE_PROJECT_REF: "test-project", SUPABASE_ACCESS_TOKEN: "test-management-token" } } };
beforeEach(() => { vi.clearAllMocks(); mocks.databaseUrl = ""; mocks.driveQuota.mockResolvedValue({ status: "not-connected" }); });

describe("fresh infrastructure usage", () => {
  it("reads updated provider usage on every request and keeps credentials out of the result", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ result: [{ total_rest_requests: 1 }] })).mockResolvedValueOnce(Response.json({ result: [{ total_rest_requests: 2 }] }));
    const first = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const second = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    expect(first.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "REST requests (today)")?.value).toBe("1");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "REST requests (today)")?.value).toBe("2");
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(second)).not.toContain("test-management-token");
    for (const [, options] of mocks.fetch.mock.calls) expect(options.cache).toBe("no-store");
  });
  it("starts live database reads while other provider requests are pending", async () => {
    mocks.databaseUrl = "postgresql://fixture:fixture@ep-test.us-east-2.aws.neon.tech/fixture";
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const execute = vi.fn().mockResolvedValue([{ database_name: "fixture", database_bytes: "1024", active_connections: "1", max_connections: "100", user_tables: "2", postgres_version: "17" }]);
    const pending = getProviderUsageOverview(context, null, null, { execute } as unknown as DatabaseClient);
    try { await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce()); }
    finally { finish(Response.json({ result: [] })); }
    expect((await pending).some(provider => provider.id === "neon")).toBe(true);
  });

  it("shows account storage, available space, and Drive-only file usage separately", async () => {
    mocks.driveQuota.mockResolvedValue({
      status: "connected",
      quota: {
        accountUsageBytes: 1.25 * 1024 ** 4,
        driveUsageBytes: 250 * 1024 ** 3,
        limitBytes: 5 * 1024 ** 4,
      },
    });
    const providers = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const drive = providers.find(provider => provider.id === "google-drive");

    expect(drive?.status).toBe("connected");
    expect(drive?.cards.find(card => card.label === "Google storage used")?.value).toBe("1.3 TB / 5.0 TB");
    expect(drive?.cards.find(card => card.label === "Free for Drive uploads")?.value).toBe("3.8 TB");
    expect(drive?.cards.find(card => card.label === "Files in Drive")?.value).toBe("250.0 GB");
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.value).toBe("No live meter");
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.help).toContain("1 TB of API egress per project per day");
    expect(drive?.cards.find(card => card.label === "Google storage used")?.meterPercent).toBe(25);
  });

  it("keeps Drive quota failures visible without failing the infrastructure overview", async () => {
    mocks.driveQuota.mockResolvedValue({ status: "unavailable" });
    const providers = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const drive = providers.find(provider => provider.id === "google-drive");

    expect(drive?.status).toBe("partial");
    expect(drive?.statusLabel).toBe("Usage unavailable");
    expect(drive?.cards.filter(card => card.label !== "Download bandwidth").every(card => card.value === "Unavailable")).toBe(true);
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.value).toBe("No live meter");
  });
});

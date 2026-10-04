import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const upsert = vi.fn(async (_values: unknown, _options: { onConflict: string }) => ({ error: null as Error | null }));
  const readRows: Array<{ key: string; value: string }> = [];
  const readError = { current: null as Error | null };
  const selectIn = vi.fn(async (_column: string, keys: string[]) => ({
    data: readRows.filter((row) => keys.includes(row.key)),
    error: readError.current,
  }));
  const select = vi.fn(() => ({ in: selectIn }));
  const clientFrom = vi.fn(() => ({ select }));
  const adminFrom = vi.fn(() => ({ upsert, select }));
  const getSupabaseClient = vi.fn(() => ({ from: clientFrom }));
  const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }));
  return { adminFrom, clientFrom, getSupabaseAdmin, getSupabaseClient, readError, readRows, select, selectIn, upsert };
});

vi.mock("../integrations/supabase/client.server", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  getSiteSetting,
  getRoleFeatureAccessSettings,
  saveAdminToolbarEnabled,
  saveMaintenanceModeEnabled,
  savePromoBarSettings,
  saveRoleFeatureAccessSettings,
  saveSearchCrawlingEnabled,
} from "./site-settings.server";
import { DEFAULT_ROLE_FEATURE_ACCESS } from "./role-feature-access";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readRows.splice(0);
  mocks.readError.current = null;
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("site settings persistence", () => {
  it("writes every admin settings option to the guarded site_settings table", async () => {
    await saveAdminToolbarEnabled(null, false);
    await saveSearchCrawlingEnabled(null, false);
    await saveMaintenanceModeEnabled(null, true);
    await savePromoBarSettings(null, true, "Scheduled maintenance tonight");
    await saveRoleFeatureAccessSettings(null, DEFAULT_ROLE_FEATURE_ACCESS);

    expect(mocks.getSupabaseClient).toHaveBeenCalledTimes(6);
    expect(mocks.getSupabaseAdmin).toHaveBeenCalledTimes(6);
    expect(mocks.adminFrom).toHaveBeenCalledTimes(6);

    const values = mocks.upsert.mock.calls.flatMap(([payload]) =>
      Array.isArray(payload) ? payload : [payload],
    ) as Array<{ key: string; value: string }>;
    expect(values).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "admin_toolbar_enabled", value: "false" }),
      expect.objectContaining({ key: "search_crawling_enabled", value: "false" }),
      expect.objectContaining({ key: "maintenance_mode_enabled", value: "true" }),
      expect.objectContaining({ key: "promo_bar_enabled", value: "true" }),
      expect.objectContaining({ key: "promo_bar_message", value: "Scheduled maintenance tonight" }),
      expect.objectContaining({
        key: "role_feature_access",
        value: JSON.stringify(DEFAULT_ROLE_FEATURE_ACCESS),
      }),
    ]));
    expect(mocks.upsert.mock.calls.every(([, options]) => options?.onConflict === "key")).toBe(true);
  });

  it("does not report a successful save when Supabase denies the write", async () => {
    const permissionError = Object.assign(new Error("permission denied for table site_settings"), {
      code: "42501",
    });
    mocks.upsert.mockResolvedValueOnce({ error: permissionError });

    await expect(saveAdminToolbarEnabled(null, true)).rejects.toBe(permissionError);
  });

  it("reads the saved role matrix from the site settings row", async () => {
    const savedAccess = {
      ...DEFAULT_ROLE_FEATURE_ACCESS,
      customer: ["overview", "affiliates"],
    };
    mocks.readRows.push({ key: "role_feature_access", value: JSON.stringify(savedAccess) });

    await expect(getRoleFeatureAccessSettings(null)).resolves.toEqual(savedAccess);
    expect(mocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.adminFrom).toHaveBeenCalledWith("site_settings");
    expect(mocks.clientFrom).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledWith("key, value");
    expect(mocks.selectIn).toHaveBeenCalledWith("key", ["role_feature_access"]);
  });

  it("can fail closed when a pricing settings read fails", async () => {
    const readError = new Error("pricing settings are temporarily unavailable");
    mocks.readError.current = readError;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteSetting(null, "pricing_packages", undefined, { failOnError: true })).rejects.toBe(readError);
    consoleError.mockRestore();
  });
});

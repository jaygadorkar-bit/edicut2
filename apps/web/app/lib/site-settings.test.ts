import { describe, expect, it } from "vitest";
import { getSiteSettingsSnapshot } from "./site-settings.server";

const noSupabaseContext = {
  cf: {
    env: {
      SUPABASE_URL: "",
      VITE_SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
};

describe("getSiteSettingsSnapshot", () => {
  it("preserves site-setting defaults when storage is unavailable", async () => {
    const snapshot = await getSiteSettingsSnapshot(null, noSupabaseContext, {
      includeAdminToolbar: true,
      includePromoBar: true,
    });

    expect(snapshot).toEqual({
      adminToolbarEnabled: true,
      searchCrawlingEnabled: true,
      maintenanceModeEnabled: false,
      promoBarSettings: {
        enabled: false,
        message: "Welcome to EdiCut! Black Friday Special: 20% off all packages.",
      },
    });
  });

  it("omits optional root-only settings when they were not requested", async () => {
    const snapshot = await getSiteSettingsSnapshot(null, noSupabaseContext);

    expect(snapshot.adminToolbarEnabled).toBe(false);
    expect(snapshot.promoBarSettings).toEqual({ enabled: false, message: "" });
  });
});

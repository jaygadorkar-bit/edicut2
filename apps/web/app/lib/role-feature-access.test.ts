import { describe, expect, it } from "vitest";
import {
  canAccessDashboardFeature,
  DASHBOARD_FEATURES,
  DEFAULT_ROLE_FEATURE_ACCESS,
  getAllowedDashboardFeatures,
  getDashboardLandingPath,
  roleFeatureAccessFromFormData,
  type RoleFeatureAccess,
} from "./role-feature-access";

describe("dashboard role access", () => {
  it("lists each customer sidebar page with its direct route", () => {
    expect(DASHBOARD_FEATURES.map(({ label }) => label)).toEqual([
      "Dashboard",
      "Projects",
      "Reviews",
      "Uploads",
      "Contact Inbox",
      "Purchases",
      "Affiliates",
      "Settings",
    ]);
    expect(DASHBOARD_FEATURES.map(({ key }) => getDashboardLandingPath([key]))).toEqual([
      "/dashboard",
      "/dashboard/projects",
      "/dashboard/reviews",
      "/dashboard/uploads",
      "/dashboard/messages",
      "/dashboard/subscriptions",
      "/dashboard/affiliates",
      "/dashboard/settings",
    ]);
  });

  it("never grants customer accounts the staff contact inbox from saved permissions", () => {
    const savedAccess: RoleFeatureAccess = {
      ...DEFAULT_ROLE_FEATURE_ACCESS,
      user: ["overview", "support"],
      customer: ["overview", "projects", "support"],
    };

    expect(getAllowedDashboardFeatures("user", savedAccess)).toEqual(["overview", "projects"]);
    expect(getAllowedDashboardFeatures("customer", savedAccess)).not.toContain("support");
    expect(canAccessDashboardFeature("customer", "support", savedAccess)).toBe(false);
    expect(canAccessDashboardFeature("customer_support", "support", savedAccess)).toBe(true);
  });

  it("saves the visible Customer settings for both customer and legacy user accounts", () => {
    const form = new FormData();
    form.set("access__customer__overview", "on");
    form.set("access__customer__uploads", "on");
    form.set("access__customer__support", "on");
    form.set("access__customer_support__support", "on");

    const access = roleFeatureAccessFromFormData(form);

    expect(access.customer).toEqual(["overview", "uploads"]);
    expect(access.user).toEqual(["overview", "uploads"]);
    expect(access.user).not.toBe(access.customer);
    expect(access.customer_support).toContain("support");
  });
});

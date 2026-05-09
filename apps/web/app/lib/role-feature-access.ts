import { USER_ROLES, normalizeUserRole, type UserRole } from "./admin-user-roles";

export const DASHBOARD_FEATURES = [
  { key: "overview", label: "Overview", path: "/dashboard" },
  { key: "projects", label: "Projects", path: "/dashboard" },
  { key: "reviews", label: "Reviews", path: "/dashboard" },
  { key: "uploads", label: "Uploads", path: "/dashboard" },
  { key: "support", label: "Contact Inbox", path: "/dashboard/messages" },
  { key: "billing", label: "Billing", path: "/dashboard" },
  { key: "affiliates", label: "Affiliates", path: "/dashboard" },
  { key: "settings", label: "Settings", path: "/dashboard" },
] as const;

export type DashboardFeature = (typeof DASHBOARD_FEATURES)[number]["key"];
export type RoleFeatureAccess = Record<UserRole, DashboardFeature[]>;

const featureSet = new Set<DashboardFeature>(DASHBOARD_FEATURES.map((feature) => feature.key));

export const DEFAULT_ROLE_FEATURE_ACCESS: RoleFeatureAccess = {
  user: ["overview", "projects", "reviews", "uploads", "support", "billing", "settings"],
  customer: ["overview", "projects", "reviews", "uploads", "support", "billing", "settings"],
  customer_support: ["overview", "support", "settings"],
  affiliate: ["overview", "affiliates", "billing", "settings"],
  editor: ["overview", "projects", "reviews", "uploads", "settings"],
  project_manager: ["overview", "projects", "reviews", "uploads", "support", "settings"],
};

export function isDashboardFeature(value: string): value is DashboardFeature {
  return featureSet.has(value as DashboardFeature);
}

export function sanitizeRoleFeatureAccess(value: unknown): RoleFeatureAccess {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return USER_ROLES.reduce<RoleFeatureAccess>((accumulator, role) => {
    const rawFeatures = input[role];
    const features = Array.isArray(rawFeatures)
      ? rawFeatures.filter((item): item is DashboardFeature => typeof item === "string" && isDashboardFeature(item))
      : DEFAULT_ROLE_FEATURE_ACCESS[role];

    accumulator[role] = Array.from(new Set(features));
    return accumulator;
  }, {} as RoleFeatureAccess);
}

export function getAllowedDashboardFeatures(role: string, access: RoleFeatureAccess): DashboardFeature[] {
  const normalizedRole = normalizeUserRole(role);
  return access[normalizedRole] ?? DEFAULT_ROLE_FEATURE_ACCESS[normalizedRole];
}

export function canAccessDashboardFeature(role: string, feature: DashboardFeature, access: RoleFeatureAccess): boolean {
  return getAllowedDashboardFeatures(role, access).includes(feature);
}

export function getDashboardLandingPath(features: DashboardFeature[]): string {
  for (const feature of features) {
    const config = DASHBOARD_FEATURES.find((item) => item.key === feature);
    if (config) {
      return config.path;
    }
  }

  return "/dashboard";
}

import { USER_ROLES, normalizeUserRole, type UserRole } from "./admin-user-roles";

export const DASHBOARD_FEATURES = [
  { key: "overview", label: "Dashboard", path: "/dashboard" },
  { key: "projects", label: "Projects", path: "/dashboard/projects" },
  { key: "reviews", label: "Reviews", path: "/dashboard/reviews" },
  { key: "uploads", label: "Uploads", path: "/dashboard/uploads" },
  { key: "support", label: "Contact Inbox", path: "/dashboard/messages" },
  { key: "billing", label: "Purchases", path: "/dashboard/subscriptions" },
  { key: "affiliates", label: "Affiliates", path: "/dashboard/affiliates" },
  { key: "settings", label: "Settings", path: "/dashboard/settings" },
] as const;

export type DashboardFeature = (typeof DASHBOARD_FEATURES)[number]["key"];
export type RoleFeatureAccess = Record<UserRole, DashboardFeature[]>;

const featureSet = new Set<DashboardFeature>(DASHBOARD_FEATURES.map((feature) => feature.key));

export const DEFAULT_ROLE_FEATURE_ACCESS: RoleFeatureAccess = {
  user: ["overview", "projects", "reviews", "uploads", "billing", "settings"],
  customer: ["overview", "projects", "reviews", "uploads", "billing", "settings"],
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

export function roleFeatureAccessFromFormData(formData: FormData): RoleFeatureAccess {
  const access = USER_ROLES.reduce<RoleFeatureAccess>((accumulator, role) => {
    if (role === "user") return accumulator;

    accumulator[role] = DASHBOARD_FEATURES
      .filter((feature) =>
        formData.get(`access__${role}__${feature.key}`) === "on" &&
        !(role === "customer" && feature.key === "support"),
      )
      .map((feature) => feature.key);

    return accumulator;
  }, {} as RoleFeatureAccess);

  // "user" is the legacy role for customer accounts. The matrix exposes one
  // Customer column, so keep both stored role names in sync.
  access.user = [...access.customer];
  return access;
}

export function getAllowedDashboardFeatures(role: string, access: RoleFeatureAccess): DashboardFeature[] {
  const normalizedRole = normalizeUserRole(role);
  const accessRole = normalizedRole === "user" ? "customer" : normalizedRole;
  const features = access[accessRole] ?? DEFAULT_ROLE_FEATURE_ACCESS[accessRole];
  if (normalizedRole === "user" || normalizedRole === "customer") {
    return features.filter((feature) => feature !== "support");
  }

  return features;
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

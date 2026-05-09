export const USER_ROLES = ["user", "customer", "customer_support", "affiliate", "editor", "project_manager"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const userRoleSet = new Set<string>(USER_ROLES);

export function isUserRole(role: string): role is UserRole {
  return userRoleSet.has(role);
}

export function normalizeUserRole(role: string | null | undefined): UserRole {
  return role && isUserRole(role) ? role : "customer";
}

export function formatUserRole(role: string) {
  return role.replaceAll("_", " ");
}

import { fetchApi } from "@/lib/api/client";
import type {
  ActionResult,
  AppRole,
  PackageInput,
  PortfolioInput,
} from "@edicut/platform-core/lib/admin-mutations";

export function createUser(input: { name: string; email: string; role: AppRole }) {
  return fetchApi<ActionResult>("/api/admin/users", {
    method: "POST",
    body: input,
  });
}

export function updateUserRole(userId: string, role: AppRole) {
  return fetchApi<ActionResult>(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export function bulkUpdateUserRoles(userIds: string[], role: AppRole) {
  return fetchApi<ActionResult>("/api/admin/users/bulk-role", {
    method: "PATCH",
    body: { userIds, role },
  });
}

export function deleteUser(userId: string) {
  return fetchApi<ActionResult>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export function bulkDeleteUsers(userIds: string[]) {
  return fetchApi<ActionResult>("/api/admin/users/bulk-delete", {
    method: "POST",
    body: { userIds },
  });
}

export function createPackage(input: PackageInput) {
  return fetchApi<ActionResult>("/api/admin/packages", {
    method: "POST",
    body: input,
  });
}

export function updatePackage(id: string, input: PackageInput) {
  return fetchApi<ActionResult>(`/api/admin/packages/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function createPortfolioItem(input: PortfolioInput) {
  return fetchApi<ActionResult>("/api/admin/portfolio", {
    method: "POST",
    body: input,
  });
}

export function updatePortfolioItem(id: string, input: PortfolioInput) {
  return fetchApi<ActionResult>(`/api/admin/portfolio/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function deletePortfolioItem(id: string) {
  return fetchApi<ActionResult>(`/api/admin/portfolio/${id}`, {
    method: "DELETE",
  });
}

export function updateSecuritySetting(key: string, value: unknown) {
  return fetchApi<ActionResult>("/api/admin/security", {
    method: "PATCH",
    body: { key, value },
  });
}


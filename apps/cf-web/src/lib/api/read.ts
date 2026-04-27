import { fetchServerApi } from "@/lib/api/server";
import type {
  AdminOverviewData,
  AdminPackageRecord,
  AdminPortfolioRecord,
  AdminProjectRecord,
  AdminUsersPageData,
} from "@edicut/platform-core/lib/admin-queries";
import type {
  DashboardOverviewData,
  DashboardProjectRecord,
} from "@edicut/platform-core/lib/dashboard-queries";

export function getAdminOverview() {
  return fetchServerApi<AdminOverviewData>("/api/admin/overview");
}

export function getAdminPackages() {
  return fetchServerApi<AdminPackageRecord[]>("/api/admin/packages");
}

export function getAdminPortfolio() {
  return fetchServerApi<AdminPortfolioRecord[]>("/api/admin/portfolio");
}

export function getAdminProjects() {
  return fetchServerApi<AdminProjectRecord[]>("/api/admin/projects");
}

export function getAdminUsers(params: {
  page: number;
  q: string;
  sort: "createdAt" | "role";
  direction: "asc" | "desc";
}) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    q: params.q,
    sort: params.sort,
    direction: params.direction,
  });

  return fetchServerApi<AdminUsersPageData>(`/api/admin/users?${searchParams.toString()}`);
}

export function getDashboardOverview() {
  return fetchServerApi<DashboardOverviewData>("/api/dashboard/overview");
}

export function getDashboardProjects() {
  return fetchServerApi<DashboardProjectRecord[]>("/api/dashboard/projects");
}

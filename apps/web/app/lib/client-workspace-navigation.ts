import type { DashboardFeature } from "./role-feature-access";

const clientNav = [
  ["Dashboard", "dashboard_customize", "/dashboard", "overview"],
  ["Projects", "video_library", "/dashboard/projects", "projects"],
  ["Reviews", "rate_review", "/dashboard/reviews", "reviews"],
  ["Files", "upload_file", "/dashboard/uploads", "uploads"],
  ["Enquiries", "mail", "/dashboard/messages", "support"],
  ["Subscriptions", "receipt_long", "/dashboard/subscriptions", "billing"],
  ["Affiliates", "hub", "/dashboard/affiliates", "affiliates"],
] as const;

export function clientNavigation(features: DashboardFeature[], role?: string) {
  const items: Array<{ label: string; icon: string; to: string; end?: boolean }> = clientNav
    .filter(item => features.includes(item[3]) && (item[3] !== "reviews" || features.includes("projects")))
    .map(([label, icon, to]) => ({ label, icon, to, end: to === "/dashboard" }));
  if (role === "project_manager" && features.includes("projects")) items.splice(2, 0, { label: "Clients", icon: "group", to: "/dashboard/clients", end: false });
  return items;
}

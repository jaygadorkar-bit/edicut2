import type { DashboardFeature } from "./role-feature-access";

const clientNav = [
  ["Dashboard", "dashboard_customize", "/dashboard", "overview"],
  ["Projects", "video_library", "/dashboard/projects", "projects"],
  ["Reviews", "rate_review", "/dashboard/reviews", "reviews"],
  ["Uploads", "upload_file", "/dashboard/uploads", "uploads"],
  ["Enquiries", "mail", "/dashboard/messages", "support"],
  ["Subscriptions", "receipt_long", "/dashboard/subscriptions", "billing"],
  ["Affiliates", "hub", "/dashboard/affiliates", "affiliates"],
] as const;

export function clientNavigation(features: DashboardFeature[]) {
  return clientNav.filter(item => features.includes(item[3])).map(([label, icon, to]) => ({ label, icon, to, end: to === "/dashboard" }));
}

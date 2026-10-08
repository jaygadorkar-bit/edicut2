import type { ReactNode } from "react";
import { Form, useRouteLoaderData } from "react-router";
import { adminPath } from "../lib/admin-paths";
import { WorkspaceShell } from "./WorkspaceShell";

export const adminPanelNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", tab: "overview" },
  { label: "Users", icon: "group", tab: "users" },
  { label: "Enquiries", icon: "mail", tab: "messages" },
  { label: "Custom quotes", icon: "description", tab: "quotes" },
  { label: "Roles", icon: "shield_person", tab: "roles" },
  { label: "Packages", icon: "sell", tab: "packages" },
  { label: "Marketing", icon: "campaign", tab: "marketing" },
  { label: "Affiliates", icon: "groups", tab: "affiliates" },
  { label: "Images", icon: "image", tab: "images" },
  { label: "Videos", icon: "movie", tab: "videos" },
  { label: "Projects", icon: "video_library", tab: "projects" },
  { label: "Purchases", icon: "receipt_long", tab: "subscriptions" },
  { label: "Audit Logs", icon: "history", tab: "audit" },
  { label: "Infrastructure", icon: "monitoring", tab: "infrastructure" },
  { label: "Settings", icon: "settings", tab: "settings" },
] as const;

type AdminPanelShellProps = {
  title: string;
  activeTab: string;
  account: {
    name: string;
    detail: string;
    imageUrl?: string | null;
  };
  unreadEnquiryCount?: number;
  headerActions?: ReactNode;
  notificationCount?: number;
  children: ReactNode;
};

export function AdminPanelShell({ title, activeTab, account, unreadEnquiryCount, headerActions, notificationCount = 0, children }: AdminPanelShellProps) {
  const rootData = useRouteLoaderData("root") as { unreadEnquiryCount?: number } | undefined;
  const visibleUnreadCount = unreadEnquiryCount ?? rootData?.unreadEnquiryCount ?? 0;
  const navItems = adminPanelNavItems.map(({ label, icon, tab }) => ({
    label,
    bottomLabel: tab === "overview" ? "Overview" : undefined,
    icon,
    to: tab === "messages" ? "/dashboard/messages" : tab === "infrastructure" || tab === "subscriptions" || tab === "quotes" ? adminPath(`/${tab}`) : adminPath(`?tab=${tab}`),
    active: tab === activeTab,
    unreadCount: tab === "messages" ? visibleUnreadCount : undefined,
  }));
  return (
    <WorkspaceShell
      title={title}
      navItems={navItems}
      account={account}
      mobileMenu
      mobileBottomNav={false}
      navigationFeedback
      hideHeaderTitle
      profileTo={adminPath("/account")}
      settingsTo={adminPath("/account")}
      notificationsTo={adminPath("?tab=projects")}
      notificationCount={notificationCount}
      accountAction={(
        <Form method="post" action="/signout" reloadDocument>
          <button type="submit" className="text-[#a0a3b5] transition hover:text-[#5a43d5]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
      )}
      headerActions={headerActions}
    >
      {children}
    </WorkspaceShell>
  );
}

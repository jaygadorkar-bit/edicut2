import type { ReactNode } from "react";
import { Form, useRouteLoaderData } from "react-router";
import { adminPath } from "../lib/admin-paths";
import { useAdminNavigationCounts } from "../lib/use-admin-navigation-counts";
import { WorkspaceShell, type WorkspaceNavigationPanel } from "./WorkspaceShell";

export const adminPanelNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", tab: "overview" },
  { label: "Orders", icon: "receipt_long", tab: "subscriptions" },
  { label: "Users", icon: "group", tab: "users" },
  { label: "Chat", icon: "chat", tab: "chat" },
  { label: "Enquiries", icon: "mail", tab: "messages" },
  { label: "Custom quotes", icon: "description", tab: "quotes" },
  { label: "Roles", icon: "shield_person", tab: "roles" },
  { label: "Packages", icon: "sell", tab: "packages" },
  { label: "Discounts", icon: "sell", tab: "marketing" },
  { label: "Affiliates", icon: "groups", tab: "affiliates" },
  { label: "Images", icon: "image", tab: "images" },
  { label: "Videos", icon: "movie", tab: "videos" },
  { label: "Projects", icon: "video_library", tab: "projects" },
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
  pendingOrderCount?: number;
  headerActions?: ReactNode;
  notificationCount?: number;
  navigationPanel?: WorkspaceNavigationPanel;
  children: ReactNode;
};

export function AdminPanelShell({ title, activeTab, account, unreadEnquiryCount, pendingOrderCount, headerActions, notificationCount = 0, navigationPanel, children }: AdminPanelShellProps) {
  const rootData = useRouteLoaderData("root") as { unreadEnquiryCount?: number; pendingOrderCount?: number; adminProfile?: { email: string; imageUrl: string } | null } | undefined;
  const profileImageUrl = rootData?.adminProfile?.email.trim().toLowerCase() === account.detail.trim().toLowerCase()
    ? rootData.adminProfile.imageUrl : null;
  const counts = useAdminNavigationCounts(pendingOrderCount ?? rootData?.pendingOrderCount ?? 0, unreadEnquiryCount ?? rootData?.unreadEnquiryCount ?? 0);
  const navItems = adminPanelNavItems.map(({ label, icon, tab }) => ({
    label,
    bottomLabel: tab === "overview" ? "Overview" : undefined,
    icon,
    to: tab === "messages" ? "/dashboard/messages" : tab === "infrastructure" || tab === "subscriptions" || tab === "quotes" || tab === "chat" ? adminPath(`/${tab}`) : adminPath(`?tab=${tab}`),
    active: tab === activeTab,
    unreadCount: tab === "messages" ? counts.unreadEnquiryCount : tab === "subscriptions" ? counts.pendingOrderCount : undefined,
    unreadLabel: tab === "subscriptions" ? "orders awaiting payment confirmation" : "unread enquiries",
  }));
  return (
    <WorkspaceShell
      title={title}
      navItems={navItems}
      account={{ ...account, imageUrl: account.imageUrl ?? profileImageUrl }}
      mobileMenu
      mobileBottomNav={false}
      navigationFeedback
      hideHeaderTitle
      chatTo={adminPath("/chat")}
      profileTo={adminPath("/account")}
      settingsTo={adminPath("/account")}
      notificationsTo={adminPath("?tab=projects")}
      notificationCount={notificationCount}
      navigationPanel={navigationPanel}
      accountAction={(
        <Form method="post" action="/signout" reloadDocument>
          <button type="submit" className="text-[#a0a3b5] transition hover:text-[#5a43d5]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
      )}
      headerActions={headerActions}
    >
      <span className="sr-only" role="status" aria-atomic="true">{`${counts.pendingOrderCount} orders awaiting payment confirmation, ${counts.unreadEnquiryCount} unread enquiries.`}</span>
      {children}
    </WorkspaceShell>
  );
}

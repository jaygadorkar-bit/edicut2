import type { ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import { adminPath } from "../lib/admin-paths";
import { useAdminNavigationCounts } from "../lib/use-admin-navigation-counts";
import { ConfirmSignOutButton } from "./ConfirmSignOutButton";
import { WorkspaceShell, type WorkspaceNavigationPanel } from "./WorkspaceShell";

export const adminPanelNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", tab: "overview" },
  { label: "Clients", icon: "folder_shared", tab: "clients" },
  { label: "Orders", icon: "receipt_long", tab: "orders" },
  { label: "Projects", icon: "video_library", tab: "projects" },
  { label: "Role manager", icon: "group", tab: "users" },
  { label: "Chat", icon: "chat", tab: "chat" },
  { label: "Support tickets", icon: "confirmation_number", tab: "tickets" },
  { label: "Enquiries", icon: "mail", tab: "messages" },
  { label: "Recruiting forms", icon: "description", tab: "recruiting-forms" },
  { label: "Custom quotes", icon: "description", tab: "quotes" },
  { label: "Role permissions", icon: "shield_person", tab: "roles" },
  { label: "Packages", icon: "sell", tab: "packages" },
  { label: "Discounts", icon: "sell", tab: "marketing" },
  { label: "Affiliates", icon: "groups", tab: "affiliates" },
  { label: "Images", icon: "image", tab: "images" },
  { label: "Marketing content", icon: "campaign", tab: "marketing-content" },
  { label: "Videos", icon: "movie", tab: "videos" },
  { label: "Analytics", icon: "travel_explore", tab: "analytics" },
  { label: "Error log", icon: "bug_report", tab: "error-log" },
  { label: "Threat log", icon: "security", tab: "threat-log" },
  { label: "Infrastructure", icon: "monitoring", tab: "infrastructure" },
  { label: "Update", icon: "system_update_alt", tab: "update" },
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
  conversationTo?: string;
  children: ReactNode;
};

export function AdminPanelShell({ title, activeTab, account, unreadEnquiryCount, pendingOrderCount, headerActions, notificationCount = 0, navigationPanel, conversationTo, children }: AdminPanelShellProps) {
  const rootData = useRouteLoaderData("root") as { unreadEnquiryCount?: number; pendingOrderCount?: number; adminProfile?: { email: string; imageUrl: string } | null } | undefined;
  const profileImageUrl = rootData?.adminProfile?.email.trim().toLowerCase() === account.detail.trim().toLowerCase()
    ? rootData.adminProfile.imageUrl : null;
  const counts = useAdminNavigationCounts(pendingOrderCount ?? rootData?.pendingOrderCount ?? 0, unreadEnquiryCount ?? rootData?.unreadEnquiryCount ?? 0);
  const navItems = adminPanelNavItems.map(({ label, icon, tab }) => ({
    label,
    bottomLabel: tab === "overview" ? "Overview" : undefined,
    icon,
    to: tab === "messages" ? "/dashboard/messages" : ["clients", "orders", "analytics", "error-log", "threat-log", "infrastructure", "update", "subscriptions", "quotes", "recruiting-forms", "marketing-content", "chat", "tickets", "projects"].includes(tab) ? adminPath(`/${tab}`) : adminPath(`?tab=${tab}`),
    active: tab === activeTab,
    unreadCount: tab === "messages" ? counts.unreadEnquiryCount : tab === "update" ? counts.availableUpdateCount : undefined,
    unreadLabel: tab === "orders"
      ? "unread order notifications"
      : tab === "update"
        ? counts.availableUpdateCount === 1 ? "software update available" : "software updates available"
        : "unread enquiries",
    notificationKind: tab === "orders" ? "order" as const : undefined,
  }));
  return (
    <WorkspaceShell
      chatScope="admin"
      projectChatTo={adminPath("/chat")}
      title={title}
      navItems={navItems}
      account={{ ...account, imageUrl: account.imageUrl ?? profileImageUrl }}
      mobileMenu
      mobileBottomNav={false}
      navigationFeedback
      hideHeaderTitle
      chatTo={conversationTo ?? adminPath("/chat")}
      ticketsTo={adminPath("/tickets")}
      profileTo={adminPath("/account")}
      settingsTo={adminPath("/account")}
      notificationsTo={adminPath("?tab=projects")}
      notificationCount={notificationCount}
      navigationPanel={navigationPanel}
      accountAction={(
        <ConfirmSignOutButton buttonClassName="neo-workspace__signout-trigger">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
        </ConfirmSignOutButton>
      )}
      headerActions={headerActions}
    >
      <span className="sr-only" role="status" aria-atomic="true">{`${counts.unreadEnquiryCount} unread enquiries. ${counts.availableUpdateCount} ${counts.availableUpdateCount === 1 ? "software update" : "software updates"} available.`}</span>
      {children}
    </WorkspaceShell>
  );
}

import type { ReactNode } from "react";
import { Form } from "react-router";
import { ADMIN_BASE_PATH, adminPath } from "../lib/admin-paths";
import { WorkspaceShell } from "./WorkspaceShell";

export const adminPanelNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", tab: "overview" },
  { label: "Users", icon: "group", tab: "users" },
  { label: "Roles", icon: "shield_person", tab: "roles" },
  { label: "Packages", icon: "sell", tab: "packages" },
  { label: "Images", icon: "image", tab: "images" },
  { label: "Videos", icon: "movie", tab: "videos" },
  { label: "Projects", icon: "video_library", tab: "projects" },
  { label: "Payments", icon: "payments", tab: "payments" },
  { label: "Audit Logs", icon: "history", tab: "audit" },
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
  headerActions?: ReactNode;
  notificationCount?: number;
  children: ReactNode;
};

export function AdminPanelShell({ title, activeTab, account, headerActions, notificationCount = 0, children }: AdminPanelShellProps) {
  const navItems = adminPanelNavItems.map(({ label, icon, tab }) => ({
    label,
    bottomLabel: tab === "overview" ? "Overview" : undefined,
    icon,
    to: adminPath(`?tab=${tab}`),
    active: tab === activeTab,
  }));
  const mobileBottomNavItems = ["Dashboard", "Projects", "Users", "Payments"]
    .map((label) => navItems.find((item) => item.label === label))
    .filter((item) => item !== undefined);

  return (
    <WorkspaceShell
      title={title}
      subtitle="EdiCut operations workspace"
      navItems={navItems}
      account={account}
      mobileMenu
      hideMobileSubtitle
      hideMobileHeading={activeTab === "overview"}
      mobileBottomNavItems={mobileBottomNavItems}
      mobileBottomMore={false}
      mobileBottomNavLabel="Primary admin navigation"
      profileTo={adminPath("/account")}
      settingsTo={adminPath("/account")}
      notificationsTo={adminPath("?tab=projects")}
      notificationCount={notificationCount}
      accountAction={(
        <Form method="post" action={ADMIN_BASE_PATH} reloadDocument>
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#a0a3b5] transition hover:text-[#5a43d5]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </Form>
      )}
      headerActions={headerActions}
    >
      {children}
    </WorkspaceShell>
  );
}

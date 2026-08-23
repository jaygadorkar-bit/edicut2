import type { ReactNode } from "react";
import { Form } from "react-router";
import { ADMIN_BASE_PATH } from "../lib/admin-paths";
import { WorkspaceShell } from "./WorkspaceShell";

export const adminPanelNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", tab: "overview" },
  { label: "Users", icon: "group", tab: "users" },
  { label: "Roles", icon: "shield_person", tab: "roles" },
  { label: "Packages", icon: "sell", tab: "packages" },
  { label: "Images", icon: "image", tab: "images" },
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
  children: ReactNode;
};

export function AdminPanelShell({ title, activeTab, account, headerActions, children }: AdminPanelShellProps) {
  return (
    <WorkspaceShell
      title={title}
      subtitle="EdiCut operations workspace"
      navItems={adminPanelNavItems.map(({ label, icon, tab }) => ({
        label,
        icon,
        to: `?tab=${tab}`,
        active: tab === activeTab,
      }))}
      account={account}
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

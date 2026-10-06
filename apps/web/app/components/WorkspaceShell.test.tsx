import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminPanelShell } from "./AdminPanelShell";
import { WorkspaceShell, type WorkspaceNavItem } from "./WorkspaceShell";

const account = { name: "Client", detail: "Client" };
const navItems: WorkspaceNavItem[] = [{ label: "Dashboard", icon: "dashboard_customize", to: "/dashboard" }];

function render(element: ReactNode) {
  const router = createMemoryRouter([{ id: "root", path: "/", element }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("workspace shell header", () => {
  it.each([
    ["client", <WorkspaceShell title="Dashboard" navItems={navItems} account={account} settingsTo="/dashboard/settings" notificationsTo="/dashboard/reviews"><p>Page content</p></WorkspaceShell>],
    ["admin", <AdminPanelShell title="Admin" activeTab="overview" account={{ name: "Admin", detail: "Administrator" }}><p>Page content</p></AdminPanelShell>],
  ])("omits the help button from the %s header", (_surface, shell) => {
    const html = render(shell);
    expect(html).not.toContain("Help and contact");
    expect(html).not.toContain(">help</span>");
    expect(html).toContain("Page content");
  });

  it("combines the bottom Profile link with account details and exposes Settings and Start project in the header", () => {
    const html = render(<WorkspaceShell
      title="Dashboard"
      navItems={navItems}
      account={account}
      mobileMenu
      profileTo="/dashboard/profile"
      profileNavAtBottom
      settingsTo="/dashboard/settings"
      startProjectTo="/dashboard/projects#new-project"
      notificationsTo={null}
    ><p>Page content</p></WorkspaceShell>);

    expect(html).not.toContain('aria-label="Account navigation"');
    expect(html).toContain('class="neo-workspace__account-link');
    expect(html).toContain('aria-label="Open profile settings for Client"');
    expect(html).not.toContain("manage_accounts");
    expect(html).toContain('href="/dashboard/profile"');
    expect(html.match(/aria-label="Open profile settings for Client"/g)).toHaveLength(3);
    expect(html).toContain('href="/dashboard/settings"');
    expect(html.match(/href="\/dashboard\/settings"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Settings" title="Settings"');
    expect(html).toContain('href="/dashboard/projects#new-project"');
    expect(html).toContain('aria-label="Start project"');
    expect(html).toContain('class="neo-workspace__start-project text-white"');
    expect(html).not.toContain('aria-label="Profile and settings"');
  });
});

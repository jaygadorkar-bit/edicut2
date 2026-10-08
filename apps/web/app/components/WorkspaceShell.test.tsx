import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminPanelShell } from "./AdminPanelShell";
import { WorkspaceShell, type WorkspaceNavItem } from "./WorkspaceShell";
import { ChatWorkspace } from "./ChatWorkspace";

const account = { name: "Client", detail: "Client" };
const navItems: WorkspaceNavItem[] = [{ label: "Dashboard", icon: "dashboard_customize", to: "/dashboard" }];

function render(element: ReactNode) {
  const router = createMemoryRouter([{ id: "root", path: "/", element }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}
function renderAdminProfile(profile: { email: string; imageUrl: string }) {
  const router = createMemoryRouter([{ id: "root", path: "/", loader: () => ({ adminProfile: profile }), element: <AdminPanelShell title="Users" activeTab="users" account={{ name: "Admin", detail: "admin@example.test" }}>Users</AdminPanelShell> }], { hydrationData: { loaderData: { root: { adminProfile: profile } } } });
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

describe("chat navigation placement", () => {
  it.each(["client", "admin"])("uses the main %s navigation for conversations with no list beside the messages", surface => {
    const html = render(<ChatWorkspace actor={{ id: "actor", key: `${surface}:actor`, name: "Client", role: surface === "admin" ? "admin" : "customer", admin: surface === "admin" }} initialState={{ rooms: [], hasMore: false, page: 1, ready: false }} renderShell={(content, navigationPanel) => surface === "admin"
      ? <AdminPanelShell title="Chat" activeTab="chat" account={account} navigationPanel={navigationPanel}>{content}</AdminPanelShell>
      : <WorkspaceShell title="Chat" navItems={navItems} account={account} mobileMenu navigationPanel={navigationPanel}>{content}</WorkspaceShell>} />);
    expect(html).toContain("Back to main menu");
    expect(html).toContain('aria-label="Conversations"');
    expect(html).toContain('aria-label="Open conversations"');
    expect(html).not.toContain('aria-label="Workspace navigation"');
    const messagePanel = html.split('aria-label="Chat workspace"')[1].split("</section>")[0];
    expect(messagePanel).not.toContain("chat-rooms");
    expect(messagePanel).toContain("Your conversations belong here.");
  });
});

describe("admin navigation notifications", () => {
  it("uses Discounts while preserving the existing coupon route", () => {
    const html = render(<AdminPanelShell title="Discounts" activeTab="marketing" account={account}>Discounts</AdminPanelShell>);
    expect(html).toContain('href="/site/node-logmin?tab=marketing"');
    expect(html).toContain('>Discounts</span>');
    expect(html).not.toContain('>Marketing</span>');
  });
  it("uses only the signed-in admin's matching profile image", () => {
    expect(renderAdminProfile({ email: "ADMIN@example.test", imageUrl: "https://lh3.googleusercontent.com/test-avatar" })).toContain('src="https://lh3.googleusercontent.com/test-avatar"');
    expect(renderAdminProfile({ email: "different@example.test", imageUrl: "https://lh3.googleusercontent.com/other-avatar" })).not.toContain('src="https://lh3.googleusercontent.com/other-avatar"');
  });
  it("places Orders below Dashboard, omits Audit Logs, and gives each badge an accurate accessible label", () => {
    const html = render(<AdminPanelShell title="Users" activeTab="users" account={account} pendingOrderCount={3} unreadEnquiryCount={7}><p>Users</p></AdminPanelShell>);
    const navigation = html.split('aria-label="Workspace navigation"')[1].split("</nav>")[0];
    expect(navigation.indexOf(">Dashboard</span>")).toBeLessThan(navigation.indexOf(">Orders</span>"));
    expect(navigation.indexOf(">Orders</span>")).toBeLessThan(navigation.indexOf(">Users</span>"));
    expect(navigation).not.toContain("Purchases");
    expect(navigation).not.toContain("Audit Logs");
    expect(navigation).toContain('class="neo-workspace__nav-count">3</span>');
    expect(navigation).toContain('class="neo-workspace__nav-count">7</span>');
    expect(navigation).toContain("3 orders awaiting payment confirmation");
    expect(navigation).toContain("7 unread enquiries");
  });
  it("hides empty badges and caps large visual counts while preserving the full accessible count", () => {
    const empty = render(<AdminPanelShell title="Users" activeTab="users" account={account}><p>Users</p></AdminPanelShell>);
    expect(empty).not.toContain('class="neo-workspace__nav-count');
    const html = render(<AdminPanelShell title="Users" activeTab="users" account={account} pendingOrderCount={105}><p>Users</p></AdminPanelShell>);
    expect(html).toContain('neo-workspace__nav-count--large">99+</span>');
    expect(html).toContain("105 orders awaiting payment confirmation");
  });
});

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminPanelShell, adminPanelNavItems } from "./AdminPanelShell";
import { AdminToolbar } from "./admin/AdminToolbar";
import { WorkspaceShell, type WorkspaceNavItem } from "./WorkspaceShell";
import { ChatWorkspace, chatReadMessageId, mergeVisibleChatMessages } from "./ChatWorkspace";
import type { ChatMessage, ChatRoom } from "../lib/chat";

const account = { name: "Client", detail: "Client" };
it("places Projects third in the administrator navigation",()=>{expect(adminPanelNavItems.slice(0,3).map(item=>item.label)).toEqual(["Dashboard","Orders","Projects"]);});
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
  it("places a client dashboard link beside the admin panel link in the admin toolbar", () => {
    const html = render(<AdminToolbar />);
    expect(html.indexOf("Admin panel")).toBeLessThan(html.indexOf("Client dashboard"));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('aria-label="Open client dashboard"');
  });

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
  it("reconciles optimistic messages with server history by client nonce", () => {
    const pending: ChatMessage & { deliveryState: "sending" } = {
      id: "pending:nonce", roomId: "room", actorKey: "user:client", senderName: "Client", senderRole: "customer",
      body: "Hello", clientNonce: "nonce", createdAt: "2026-10-09T10:00:00.000Z", editedAt: null, deletedAt: null,
      attachment: null, deliveryState: "sending",
    };
    const saved: ChatMessage = { ...pending, id: "saved-message" };
    expect(mergeVisibleChatMessages([pending], [saved])).toEqual([saved]);
    expect(mergeVisibleChatMessages([pending], [])).toEqual([pending]);
  });

  it("only marks unread, confirmed history as read", () => {
    const saved: ChatMessage = { id: "saved-message", roomId: "room", actorKey: "user:manager", senderName: "Manager", senderRole: "project_manager",
      body: "Hello", clientNonce: "saved-nonce", createdAt: "2026-10-09T10:00:00.000Z", editedAt: null, deletedAt: null, attachment: null };
    const pending = { ...saved, id: "pending:nonce", deliveryState: "sending" as const };
    expect(chatReadMessageId([saved], 0, "")).toBeNull();
    expect(chatReadMessageId([saved], 1, saved.id)).toBeNull();
    expect(chatReadMessageId([pending], 1, "")).toBeNull();
    expect(chatReadMessageId([saved, pending], 1, "")).toBe(saved.id);
  });

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
  it("shows group member photos or initials with their role and chat activity", () => {
    const project: ChatRoom = {
      id: "room", clientId: "client", clientName: "Client", clientEmail: "client@example.test", clientActive: true,
      kind: "manager", managerId: "manager", managerName: "Maya Brooks", managerActive: true,
      lastMessageAt: null, lastMessagePreview: "Welcome to your project group.", updatedAt: "2026-10-09T12:00:00.000Z", unreadCount: 0,
      projectUnlocked: true, ticket: null,
      participants: [
        { key: "admin:admin", name: "EdiCut Admin", role: "admin", avatarUrl: "https://cdn.example.test/admin.png", lastActiveAt: new Date(Date.now() - 5 * 60_000).toISOString() },
        { key: "user:manager", name: "Maya Brooks", role: "project_manager", avatarUrl: null, lastActiveAt: null },
      ],
    };
    const html = render(<ChatWorkspace actor={{ id: "client", key: "user:client", name: "Client", role: "customer", admin: false }} initialState={{ rooms: [project], hasMore: false, page: 1, ready: true }} renderShell={(content, navigationPanel) => <WorkspaceShell title="Chat" navItems={navItems} account={account} mobileMenu navigationPanel={navigationPanel}>{content}</WorkspaceShell>} />);
    expect(html).toContain('src="https://cdn.example.test/admin.png"');
    expect(html).toContain("EdiCut Admin");
    expect(html).toContain("Admin · Active 5m ago");
    expect(html).toContain("2 Members");
    expect(html).toContain("chat-room-member-dot has-recent-activity");
    expect(html).toContain("MB");
    expect(html).toContain("Project manager · No activity yet");

    const adminHtml = render(<ChatWorkspace actor={{ id: "admin", key: "admin:current", name: "Admin", role: "admin", admin: true }} initialState={{ rooms: [project], hasMore: false, page: 1, ready: true }} renderShell={(content, navigationPanel) => <AdminPanelShell title="Chat" activeTab="chat" account={account} navigationPanel={navigationPanel}>{content}</AdminPanelShell>} />);
    expect(adminHtml).toContain("Admin · Active now");
  });
  it("omits the redundant project-groups heading in the admin conversation view", () => {
    const html = render(<ChatWorkspace actor={{ id: "admin", key: "admin:admin", name: "Admin", role: "admin", admin: true }} initialState={{ rooms: [], hasMore: false, page: 1, ready: true }} renderShell={(content, navigationPanel) => <AdminPanelShell title="Chat" activeTab="chat" account={account} navigationPanel={navigationPanel}>{content}</AdminPanelShell>} />);
    expect(html).not.toContain('class="chat-page-heading"');
    expect(html).not.toContain("Customers, admins, and the assigned project manager, together.");
  });
  it("places manager assignment after the search icon without opening the search field", () => {
    const project: ChatRoom = {
      id: "room", clientId: "client", clientName: "Client", clientEmail: "client@example.test", clientActive: true,
      kind: "manager", managerId: "manager", managerName: "Maya Brooks", managerActive: true,
      lastMessageAt: null, lastMessagePreview: "Welcome to your project group.", updatedAt: "2026-10-09T12:00:00.000Z", unreadCount: 0,
      projectUnlocked: true, ticket: null,
    };
    const html = render(<ChatWorkspace actor={{ id: "admin", key: "admin:admin", name: "Admin", role: "admin", admin: true }} initialState={{ rooms: [project], hasMore: false, page: 1, ready: true }} renderShell={(content, navigationPanel) => <AdminPanelShell title="Chat" activeTab="chat" account={account} navigationPanel={navigationPanel}>{content}</AdminPanelShell>} />);
    expect(html).toMatch(/<header class="chat-conversation-header has-manager-tools">.*?<button class="chat-icon-button" aria-label="Search messages" aria-expanded="false".*?<form class="chat-assignment"/);
    expect(html).not.toContain('class="chat-search chat-message-search"');
    expect(html).toContain('id="chat-manager"');
    expect(html).toContain('<option value="manager" selected="">Maya Brooks</option>');
    expect(html).toContain('role="status">Loading project managers…</p>');
    expect(html).not.toContain('Previous manager (unavailable)');
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
    expect(navigation).toContain(">Support tickets</span>");
    expect(navigation).not.toContain(">Tickets</span>");
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

describe("chat and ticket navigation notifications", () => {
  it("shows separate message counts on desktop and mobile, including a custom bottom menu", () => {
    const html = render(<WorkspaceShell title="Dashboard" navItems={navItems} account={account} mobileMenu
      initialChatUnreadCounts={{ projects: 3, tickets: 105 }}
      mobileBottomNavItems={[{ label: 'Chat', icon: 'chat', to: '/dashboard/chat' }, { label: 'Support tickets', icon: 'confirmation_number', to: '/dashboard/tickets' }]}>Dashboard</WorkspaceShell>);
    expect(html).toContain('class="neo-workspace__nav-count">3</span>');
    expect(html).toContain('neo-workspace__nav-count--large">99+</span>');
    expect(html).toContain('neo-workspace__nav-count--overlay">3</span>');
    expect(html).toContain('3 unread chat messages');
    expect(html).toContain('105 unread ticket messages');
  });
  it("hides both red badges when there are no unread messages", () => {
    const html = render(<WorkspaceShell title="Dashboard" navItems={navItems} account={account} mobileMenu
      initialChatUnreadCounts={{ projects: 0, tickets: 0 }}>Dashboard</WorkspaceShell>);
    expect(html).not.toContain('class="neo-workspace__nav-count');
  });
  it("keeps the project chat count separate when the ticket page owns the conversation panel", () => {
    const items = [{ label: 'Chat', icon: 'chat', to: '/site/node-logmin/chat' }, { label: 'Support tickets', icon: 'confirmation_number', to: '/site/node-logmin/tickets' }];
    const html = render(<WorkspaceShell title="Support tickets" navItems={items} account={account} chatScope="admin"
      chatTo="/site/node-logmin/tickets" projectChatTo="/site/node-logmin/chat" ticketsTo="/site/node-logmin/tickets"
      initialChatUnreadCounts={{ projects: 7, tickets: 2 }}>Support tickets</WorkspaceShell>);
    const navigation = html.split('aria-label="Workspace navigation"')[1].split('</nav>')[0];
    expect(navigation).toContain(">Support tickets</span>");
    expect(navigation).not.toContain(">Tickets</span>");
    expect(navigation).toContain('7 unread chat messages');
    expect(navigation).toContain('2 unread ticket messages');
  });
});

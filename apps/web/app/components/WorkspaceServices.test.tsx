import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";
import { WorkspaceLoadingOverlay } from "./WorkspaceLoadingOverlay";
import { WorkspaceServices, workspaceManagesChat, workspaceServiceScope } from "./WorkspaceServices";
import { useChatUnreadCounts, WorkspaceChatUnreadProvider } from "../lib/use-chat-unread-counts";

describe("persistent workspace services", () => {
  it.each(["/dashboard", "/dashboard/projects", "/dashboard/projects/project-id", "/dashboard/subscriptions"])(
    "shares the client services on %s", path => expect(workspaceServiceScope(path)).toBe("client"),
  );
  it.each(["/site/node-logmin", "/site/node-logmin/chat", "/site/node-logmin/users/user-id"])(
    "isolates the administrator services on %s", path => expect(workspaceServiceScope(path)).toBe("admin"),
  );
  it.each(["/", "/signin", "/signout", "/site/node-logmin/login", "/site/node-logmin/access", "/dashboard-other", "/site/node-logmin-other"])(
    "does not start workspace services on %s", path => expect(workspaceServiceScope(path)).toBeNull(),
  );
  it.each(["/dashboard/chat", "/dashboard/tickets", "/site/node-logmin/chat", "/site/node-logmin/tickets", "/dashboard/chat/", "/site/node-logmin/tickets/"])(
    "lets the conversation page own its live chat connection on %s", path => expect(workspaceManagesChat(path)).toBe(true),
  );
  it.each(["/dashboard", "/dashboard/projects", "/site/node-logmin", "/dashboard/chat-other"])(
    "keeps live badges active on %s", path => expect(workspaceManagesChat(path)).toBe(false),
  );

  it("renders one notification dialog when a route shell is inside the persistent provider", () => {
    const router = createMemoryRouter([{ path: "/", element:
      <WorkspaceServices scope="client" managedChat={false}>
        <WorkspaceShell title="Dashboard" navItems={[]} account={{ name: "Client", detail: "Client" }}>Page</WorkspaceShell>
      </WorkspaceServices>,
    }]);
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html.match(/<dialog/g)).toHaveLength(1);
    expect(html).toContain("Page");
    expect(html).toContain('title="Notifications"');
  });

  it("never uses client unread counts for an administrator consumer", () => {
    function Counts() {
      const counts = useChatUnreadCounts("admin", false, { projects: 7, tickets: 2 });
      return <p>{counts.projects}:{counts.tickets}</p>;
    }
    const html = renderToStaticMarkup(<WorkspaceChatUnreadProvider scope="client" managed={false}><Counts /></WorkspaceChatUnreadProvider>);
    expect(html).toContain("7:2");
  });
});

it("announces navigation with a progress bar without a blocking spinner", () => {
  const html = renderToStaticMarkup(<WorkspaceLoadingOverlay />);
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading dashboard");
  expect(html).toContain("neo-workspace-loading__progress");
  expect(html).not.toContain("spinner");
});

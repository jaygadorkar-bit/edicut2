// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell, WorkspaceNotificationsProvider, useMarkNotificationRead } from "./WorkspaceNotifications";

vi.mock("../lib/workspace-realtime.client", () => ({
  subscribeWorkspaceRealtime: () => () => {},
}));
vi.mock("../lib/admin-navigation-live", () => ({
  startAdminNavigationPolling: () => () => {},
}));

const applicationId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-11-11T03:00:00.000Z";
const eventId = `recruiting:${applicationId}:${timestamp}:Newpartnerapplication`;
let host: HTMLDivElement;
let root: Root;
let resolveFeed: (response: Response) => void;
let feedResponse: Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;

function ReadButton() {
  const markRead = useMarkNotificationRead();
  return <button type="button" onClick={() => markRead("recruiting", applicationId)}>View answers</button>;
}

function NotificationHarness() {
  return <>
    <NotificationBell />
    <button type="button">Workspace</button>
  </>;
}

function notificationFeed(readAt: string | null) {
  return {
    identity: "admin:current",
    events: [{
      id: eventId,
      kind: "recruiting",
      title: "New partner application",
      detail: "Taylor Editor — taylor@example.test",
      to: "/site/node-logmin/recruiting-forms",
      occurredAt: timestamp,
      readAt,
      readBy: readAt ? "current" : null,
    }],
    generatedAt: timestamp,
    partial: false,
    kinds: ["recruiting"],
    unavailableKinds: [],
    readReceiptsAvailable: true,
  };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  feedResponse = new Promise((resolve) => { resolveFeed = resolve; });
  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { eventIds: string[]; read: boolean };
      return new Response(JSON.stringify({ eventIds: body.eventIds, readAt: timestamp }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return feedResponse;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("recruiting notification read receipts", () => {
  it("marks an application read after an early click while the feed is loading and skips later writes", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceNotificationsProvider scope="admin">
            <ReadButton />
          </WorkspaceNotificationsProvider>
        </MemoryRouter>,
      );
    });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/notifications?scope=admin")).toBe(true);

    await act(async () => {
      host.querySelector("button")?.click();
    });
    await act(async () => {
      resolveFeed(new Response(JSON.stringify(notificationFeed(null)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]?.[1]?.body))).toEqual({ eventIds: [eventId], read: true });

    await act(async () => {
      host.querySelector("button")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls()).toHaveLength(1);
  });
});

describe("notification authentication feedback", () => {
  async function renderNotifications(path: string, scope: "admin" | "client") {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <WorkspaceNotificationsProvider scope={scope}>
            <NotificationHarness />
          </WorkspaceNotificationsProvider>
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label^="Notifications"]')?.click();
    });
  }

  it("offers a return-to-admin sign-in link after 401 and clears it after recovery", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await renderNotifications("/site/node-logmin/orders?view=recent", "admin");
    expect(host.textContent).toContain("Sign in again to view notifications.");
    const signIn = host.querySelector<HTMLAnchorElement>('a[href^="/signin?"]');
    expect(signIn?.getAttribute("href")).toBe(
      "/signin?mode=signin&redirectTo=%2Fsite%2Fnode-logmin%2Faccess%3FreturnTo%3D%252Fsite%252Fnode-logmin%252Forders%253Fview%253Drecent",
    );

    await act(async () => {
      Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Retry")?.click();
      resolveFeed(new Response(JSON.stringify({
        identity: "admin:current",
        events: [],
        generatedAt: timestamp,
        partial: false,
        kinds: [],
        unavailableKinds: [],
        readReceiptsAvailable: true,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).not.toContain("Sign in again to view notifications.");
    expect(host.querySelector('a[href^="/signin?"]')).toBeNull();
  });

  it("shows a distinct permission message after 403 without a sign-in link", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await renderNotifications("/site/node-logmin/orders", "admin");
    expect(host.textContent).toContain("This account doesn’t have permission to view notifications.");
    expect(host.textContent).not.toContain("Sign in again to view notifications.");
    expect(host.querySelector('a[href^="/signin?"]')).toBeNull();
  });
});

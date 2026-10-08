import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientBalance } from "./ClientBalance";
import type { ClientPurchase } from "../lib/client-workspace.server";

afterEach(() => vi.unstubAllEnvs());

describe("monthly balance dates", () => {
  it.each(["UTC", "Asia/Dhaka", "America/Los_Angeles"])("renders the same expiry date in %s", timezone => {
    vi.stubEnv("TZ", timezone);
    const purchase: ClientPurchase = {
      id: "purchase-id", name: "Growth", slug: "creator-plus", type: "monthly",
      granted: 6600, used: 0, remaining: 6600, active: true,
      paidAt: "2026-10-05T23:40:00.000Z", expiresAt: "2026-11-05T23:40:00.000Z",
    };
    const router = createMemoryRouter([{ path: "/", element: createElement(ClientBalance, {
      purchases: [purchase], hasProfile: true, canStartProjects: true,
    }) }]);
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain("Period ends 11/5/2026");
  });
});

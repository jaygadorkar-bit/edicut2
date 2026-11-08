import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireClientWorkspace: vi.fn(async () => ({ features: ["projects", "reviews"] })),
}));

vi.mock("../lib/client-workspace-access.server", () => ({
  requireClientWorkspace: mocks.requireClientWorkspace,
}));

import { loader } from "./dashboard-reviews";

function args() {
  const request = new Request("http://localhost:3002/dashboard/reviews");
  return { request, context: {}, params: {} } as Parameters<typeof loader>[0];
}

describe("dashboard review landing route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to the review-filtered project list when Reviews is enabled", async () => {
    const response = await loader(args()) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard/projects?view=reviews");
  });

  it("returns to Projects when Reviews is disabled", async () => {
    mocks.requireClientWorkspace.mockResolvedValueOnce({ features: ["projects"] });
    try {
      await loader(args());
      throw new Error("Expected a redirect");
    } catch (response) {
      expect((response as Response).headers.get("Location")).toBe("/dashboard/projects");
    }
  });
});

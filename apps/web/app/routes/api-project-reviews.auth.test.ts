import { beforeEach, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const mocks = vi.hoisted(() => ({ loader: vi.fn(), action: vi.fn() }));
vi.mock("../lib/project-review-route.server", () => ({
  projectReviewLoader: mocks.loader,
  projectReviewAction: mocks.action,
}));
import { action, loader } from "./api-project-reviews";

const url = "https://edicut.example/api/project-reviews/project-1?scope=admin";
const args = (request: Request) => ({ request, context: {}, params: { projectId: "project-1" } });

beforeEach(() => vi.clearAllMocks());

it("replays a project review loader refresh redirect with a 307 and rotated cookie", async () => {
  mocks.loader.mockRejectedValueOnce(new Response(null, {
    status: 302,
    headers: { Location: url, "Set-Cookie": "_edicut_admin=rotated; Path=/" },
  }));
  const response = await loader(args(new Request(url)) as LoaderFunctionArgs);
  expect(response.status).toBe(307);
  expect(response.headers.get("Location")).toBe(url);
  expect(response.headers.get("Set-Cookie")).toContain("_edicut_admin=rotated");
});

it("replays a project review action refresh redirect with a 307", async () => {
  mocks.action.mockRejectedValueOnce(new Response(null, {
    status: 302,
    headers: { Location: url, "Set-Cookie": "_edicut_admin=rotated; Path=/" },
  }));
  const request = new Request(url, { method: "PATCH" });
  const response = await action(args(request) as ActionFunctionArgs);
  expect(response.status).toBe(307);
  expect(response.headers.get("Location")).toBe(url);
  expect(response.headers.get("Set-Cookie")).toContain("_edicut_admin=rotated");
});

it("returns terminal project review sign-in redirects as JSON 401 and clears the cookie", async () => {
  mocks.loader.mockRejectedValueOnce(new Response(null, {
    status: 302,
    headers: { Location: "/signin?mode=signin", "Set-Cookie": "_edicut_admin=; Max-Age=0; Path=/" },
  }));
  const response = await loader(args(new Request(url)) as LoaderFunctionArgs);
  expect(response.status).toBe(401);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  expect(await response.json()).toMatchObject({ sessionExpired: true });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ProjectLibrary } from "./ProjectLibrary";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "owner-1",
  title: "Launch cut",
  channelName: "EdiCut Studio",
  status: "editing",
  deadline: null,
  notes: "Internal brief notes",
  updatedAt: new Date("2026-10-16T10:00:00Z"),
};

function render(reviewsEnabled: boolean) {
  const router = createMemoryRouter([{
    path: "/",
    element: createElement(ProjectLibrary, {
      projects: [project], total: 1, staff: true, manager: true, reviewsEnabled,
      editors: [{ id: "editor-1", name: "Alex Editor", role: "editor" }],
      onAssign: async () => ({ success: "Saved" }),
    }),
  }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("ProjectLibrary feature access", () => {
  it("hides review and assignment routes when Reviews is disabled", () => {
    const html = render(false);
    expect(html).toContain("Launch cut");
    expect(html).toContain("Project details unavailable");
    expect(html).not.toContain("/dashboard/projects/11111111-1111-4111-8111-111111111111");
    expect(html).not.toContain("Ready for review");
    expect(html).not.toContain("Needs editor");
    expect(html).not.toContain("Internal brief notes");
    expect(html).not.toContain("Assign editor");
  });
});

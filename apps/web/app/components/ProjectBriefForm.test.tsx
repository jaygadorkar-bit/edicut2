import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { BRIEF_STEPS, briefErrorStep, ProjectBriefForm } from "./ProjectBriefForm";
import type { ClientPurchase } from "../lib/client-workspace.server";

const purchase: ClientPurchase = { id: "paid", name: "Creator", slug: "creator", type: "monthly", granted: 120, used: 0, remaining: 120, paidAt: "2026-10-01", expiresAt: "2026-11-01", active: true };
describe("project brief steps", () => {
  it("routes field errors to the earliest relevant step", () => {
    BRIEF_STEPS.forEach((step, index) => step.fields.forEach(field => expect(briefErrorStep({ [field]: "Required" })).toBe(index)));
    expect(briefErrorStep({ deadline: "Required", footageUrl: "Required" })).toBe(1);
  });
  it("renders a usable form without JavaScript and retains failed submission values", () => {
    const element = <ProjectBriefForm purchases={[purchase]} token="fresh-token" result={{ values: { title: "Retained title", requestToken: "same-token" } }} />;
    const router = createMemoryRouter([{ path: "/", element }]);
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain('value="Retained title"');
    expect(html).toContain('value="same-token"');
    expect(html).not.toContain('name="rawMinutes"');
    expect(html).not.toContain("hidden=\"\"");
    expect(html).not.toContain('name="editingHours"');
    expect(html).not.toContain('name="videoType"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain("No hours are deducted");
    expect(html).toContain('type="submit"');
  });
});

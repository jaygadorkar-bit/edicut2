import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { RoleDashboardOverview } from "./RoleDashboardOverviews";
import type { AffiliatePortalData } from "../../lib/marketing.server";
import type { ReviewProject } from "../../lib/project-review";

const project: ReviewProject = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "owner-1",
  title: "Launch cut",
  channelName: "EdiCut Studio",
  status: "editing",
  deadline: "2026-10-21",
  notes: null,
  updatedAt: new Date("2026-10-16T10:00:00Z"),
};

function render(element: ReactNode) {
  const router = createMemoryRouter([{ path: "/", element }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("role-specific dashboard overviews", () => {
  it("gives project managers team assignment totals and the editor workload", () => {
    const html = render(<RoleDashboardOverview
      role="project_manager"
      projectsEnabled
      reviewsEnabled
      projects={[project]}
      projectCount={8}
      activeCount={5}
      reviewCount={2}
      deliveredCount={3}
      unassignedCount={1}
      editors={[{ id: "editor-1", name: "Alex Editor", role: "editor", activeProjects: 2, dueSoonProjects: 1, overdueProjects: 1 }]}
      managerTasks={[{ ...project, clientName: "Creator", nextAction: "Assign an editor" }]}
    />);

    expect(html).toContain("Keep the edit moving.");
    expect(html).toContain("Need an editor");
    expect(html).toContain("Alex Editor");
    expect(html).toContain("2 active");
    expect(html).toContain("Open assignment board");
    expect(html).toContain("/dashboard/projects?view=unassigned#your-projects");
    expect(html).toContain("/dashboard/projects?view=active");
    expect(html).toContain("/dashboard/reviews");
    expect(html).toContain("Client review");
    expect(html).toContain("Needs editor");
    expect(html).toContain("Next actions");
    expect(html).toContain("Creator");
    expect(html).toContain("1 due in 7 days");
    expect(html).toContain("1 overdue");
    expect(html).toContain("/dashboard/clients");
  });

  it("keeps editor home focused on assigned projects and review work", () => {
    const html = render(<RoleDashboardOverview
      role="editor"
      projectsEnabled
      reviewsEnabled
      projects={[project]}
      projectCount={1}
      activeCount={1}
      reviewCount={0}
      deliveredCount={0}
      unassignedCount={0}
      editors={[]}
    />);

    expect(html).toContain("Your edit queue.");
    expect(html).toContain("Launch cut");
    expect(html).toContain("In editing");
    expect(html).toContain("/dashboard/projects/11111111-1111-4111-8111-111111111111");
    expect(html).not.toContain("Editor assignments");
  });

  it("does not show broken project actions when Reviews access is disabled", () => {
    const html = render(<RoleDashboardOverview
      role="project_manager"
      projectsEnabled
      reviewsEnabled={false}
      projects={[project]}
      projectCount={1}
      activeCount={1}
      reviewCount={0}
      deliveredCount={0}
      unassignedCount={0}
      editors={[{ id: "editor-1", name: "Alex Editor", role: "editor", activeProjects: 2 }]}
      managerTasks={[{ ...project, clientName: "Creator", nextAction: "Assign an editor" }]}
    />);

    expect(html).toContain("Reviews access is required");
    expect(html).not.toContain("Need an editor");
    expect(html).not.toContain("Editor assignments");
    expect(html).not.toContain("/dashboard/projects/11111111-1111-4111-8111-111111111111");
    expect(html).not.toContain("/dashboard/reviews");
  });

  it("shows an affiliate's own referral and commission summary", () => {
    const affiliate: AffiliatePortalData = {
      id: "affiliate-1",
      code: "ALEXEDIT",
      commissionRateBps: 1000,
      active: true,
      referralUrl: "https://example.test/pricing/creator?ref=ALEXEDIT",
      orderCount: 3,
      paidOrderCount: 2,
      paidRevenueCents: 50000,
      commissionEarnedCents: 5000,
      pendingCommissionCents: 1000,
      orders: [{
        id: "order-1",
        kind: "subscription",
        label: "Creator plan",
        status: "paid",
        createdAt: "2026-10-16T10:00:00Z",
        amountCents: 50000,
        commissionCents: 5000,
        pendingCommissionCents: 0,
        currency: "USD",
      }],
    };
    const html = render(<RoleDashboardOverview affiliate={affiliate} ready />);

    expect(html).toContain("Your referrals, clearly tracked.");
    expect(html).toContain("ALEXEDIT");
    expect(html).toContain("$50.00");
    expect(html).toContain("$10.00");
    expect(html).toContain("Link visits are not counted in this report.");
  });

  it("offers the affiliate application path when no profile exists", () => {
    const html = render(<RoleDashboardOverview affiliate={null} ready />);
    expect(html).toContain("Your partner profile is not active yet.");
    expect(html).toContain("/dashboard/affiliates");
  });
});

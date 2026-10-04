import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { CustomerSubscription } from "../lib/customer-subscriptions.server";
import { SubscriptionList, type SubscriptionSummary } from "./SubscriptionList";
const subscription: CustomerSubscription = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  packageSlug: "creator-plus", planName: "Growth", purchaseType: "monthly", country: "BD", phone: "+8801712345678",
  subtotalCents: 104900, discountCents: 0, amountCents: 104900, currency: "USD", couponCode: null, affiliateId: null, affiliateCode: null, affiliateCommissionBps: 0,
  status: "unpaid", paidAt: null, paidBy: null, deletedAt: null, createdAt: new Date("2026-10-03"), updatedAt: new Date("2026-10-03"),
};
function render(record = subscription, admin = false, summary?: SubscriptionSummary) {
  const router = createMemoryRouter([{ path: "/", element: createElement(SubscriptionList, { rows: [{ subscription: record, email: "customer@example.test" }], admin, summary }) }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}
describe("subscription views", () => {
  it("shows saved contact, price, unpaid state, resume and deletion for customers", () => {
    const html = render();
    expect(html).toContain("$1,049.00"); expect(html).toContain("Monthly package"); expect(html).toContain("Bangladesh"); expect(html).toContain(subscription.phone);
    expect(html).toContain("Unpaid"); expect(html).toContain("Delete unpaid"); expect(html).toContain("Review purchase");
    expect(html).not.toContain("Mark as paid");
  });
  it("labels one-time video purchases without monthly billing language", () => {
    const html = render({ ...subscription, packageSlug: "single-creator", planName: "Creator Video", purchaseType: "single", amountCents: 10900 });
    expect(html).toContain("Single video edit");
    expect(html).toContain("$109.00 one time");
    expect(html).not.toContain("/ month");
  });
  it("gives admins a payment action and customer identity", () => {
    const html = render(subscription, true, { total: 3, paid: 2, unpaid: 1 });
    expect(html).toContain("Mark as paid"); expect(html).toContain("customer@example.test");
    expect(html).not.toContain("Delete unpaid"); expect(html).not.toContain("Review purchase");
    expect(html).toContain("Purchase overview"); expect(html).toContain("Purchase ledger");
    expect(html).toContain('aria-label="Paid package selections"'); expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-label="Unpaid package selections"'); expect(html).toContain('aria-valuenow="1"');
  });
  it.each([false, true])("paid records have no unpaid actions (admin=%s)", admin => {
    const html = render({ ...subscription, status: "paid", paidAt: new Date("2026-10-03"), paidBy: "admin-id" }, admin);
    expect(html).toContain("Paid"); expect(html).toContain("Manual confirmation");
    expect(html).not.toContain("Delete unpaid"); expect(html).not.toContain("Mark as paid");
  });
});

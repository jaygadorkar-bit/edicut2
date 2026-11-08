// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminOrdersWorkspace,
  type AdminOrdersData,
} from "./AdminOrdersWorkspace";
import type { CustomerSubscription } from "../../lib/customer-subscriptions.server";

const record: CustomerSubscription = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  packageSlug: "creator-plus",
  planName: "Growth",
  purchaseType: "monthly",
  country: "BD",
  phone: "+8801712345678",
  addOns: [],
  subtotalCents: 104900,
  discountCents: 0,
  amountCents: 104900,
  currency: "USD",
  couponCode: null,
  affiliateId: null,
  affiliateCode: null,
  affiliateCommissionBps: 0,
  status: "unpaid",
  paidAt: null,
  paidBy: null,
  paymentProvider: null,
  cryptomusInvoiceUuid: null,
  cryptomusPaymentUrl: null,
  cryptomusInvoiceExpiresAt: null,
  deletedAt: null,
  createdAt: new Date("2026-10-03"),
  updatedAt: new Date("2026-10-03"),
};
const base = "/site/node-logmin/orders";
let host: HTMLDivElement, root: Root;
const submit = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  submit.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(
  patch: Partial<AdminOrdersData> = {},
  query = "",
) {
  const now = "2026-10-21T12:00:00.000Z";
  const data: AdminOrdersData = {
    records: [
      {
        subscription: record,
        name: "Client",
        email: "client@example.test",
        isClient: true,
      },
    ],
    summary: { total: 1, paid: 0, unpaid: 1 },
    status: "all",
    page: 1,
    hasNext: false,
    eventId: null,
    ownerId: null,
    ...patch,
  };
  const routePath = data.ownerId ? "/site/node-logmin/clients" : base;
  const router = createMemoryRouter(
    [
      {
        path: routePath,
        element: <AdminOrdersWorkspace data={data} now={now} />,
        action: async ({ request }) => {
          submit(await request.formData());
          return { success: "Saved" };
        },
      },
    ],
    { initialEntries: [routePath + query] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
}
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === text,
  )!;
async function click(el: HTMLElement) {
  await act(async () => el.click());
}
describe("minimal order workflow", () => {
  it("keeps order details and mutation controls collapsed until requested", async () => {
    await render();
    expect(host.textContent).toContain("Growth");
    expect(host.textContent).toContain("3 Oct 2026, 00:00 UTC");
    expect(host.textContent).toContain("18 days ago");
    expect(host.textContent).toContain("$1,049.00");
    expect(host.textContent).not.toContain("Record payment");
    await click(
      host.querySelector<HTMLButtonElement>(".client-order-summary")!,
    );
    expect(host.textContent).toContain("Bangladesh");
    expect(host.textContent).toContain("Record payment");
    expect(host.textContent).toContain("Remove");
    expect(submit).not.toHaveBeenCalled();
  });
  it("requires explicit payment confirmation and submits the displayed record revision", async () => {
    await render({ eventId: record.id });
    await click(button("Record payment"));
    expect(submit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("it does not charge a card");
    expect(document.activeElement).toBe(button("Confirm payment received"));
    await click(button("Confirm payment received"));
    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.calls[0][0] as FormData;
    expect(form.get("intent")).toBe("mark-paid");
    expect(form.get("subscriptionId")).toBe(record.id);
    expect(form.get("expectedUpdatedAt")).toBe(record.updatedAt.toISOString());
  });
  it("cancels removal without a mutation and returns focus", async () => {
    await render({ eventId: record.id });
    const remove = button("Remove");
    await click(remove);
    expect(host.textContent).toContain("blocked after project work starts");
    await click(button("Cancel"));
    expect(submit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("Remove"));
  });
  it("uses client order pagination without changing directory pagination", async () => {
    await render(
      {
        ownerId: record.ownerId,
        summary: { total: 51, paid: 0, unpaid: 51 },
        hasNext: true,
      },
      `?client=${record.ownerId}&section=orders&page=3`,
    );
    const next = [...host.querySelectorAll<HTMLAnchorElement>("a")].find(
      (el) => el.textContent === "Next",
    )!;
    expect(next.getAttribute("href")).toContain("page=3&orderPage=2");
    expect(host.querySelector("a[download]")).toBeNull();
    expect(host.textContent).toContain("All clients' orders");
  });
  it("exports the complete ledger and clears selected-order context when changing status", async () => {
    await render(
      { eventId: record.id },
      `?event=${record.id}&page=9`,
    );
    expect(host.querySelector("a[download]")?.getAttribute("href")).toBe(
      "/site/node-logmin/subscriptions/export",
    );
    const paid = [...host.querySelectorAll<HTMLAnchorElement>("a")].find((el) =>
      el.textContent?.startsWith("Paid"),
    )!;
    expect(paid.getAttribute("href")).toBe(`${base}?status=paid`);
  });
});

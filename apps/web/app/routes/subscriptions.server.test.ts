import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(async () => "customer-id"),
  requireAdminUser: vi.fn(async () => ({ id: "admin-id", role: "admin", active: true, email: "admin@example.test", name: "Admin", passwordHash: "secret" })),
  findUserById: vi.fn(async () => ({ id: "customer-id", role: "customer", active: true, deletedAt: null, name: "Customer", email: "customer@example.test", passwordHash: "secret" })),
  subscriptionSummaryRows: [{ total: 3, paid: 1, unpaid: 2 }],
  getDbFromContext: vi.fn(() => ({ select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => mocks.subscriptionSummaryRows) })) })) })),
  getRoleFeatureAccessSettings: vi.fn(async () => ({ customer: ["overview", "billing"] })),
  consumeUsageLimit: vi.fn(async () => "allowed"), requestBodyExceedsLimit: vi.fn(() => false),
  listCustomerSubscriptions: vi.fn(async () => [] as unknown[]), listAdminSubscriptions: vi.fn(async () => [] as unknown[]),
  listAdminSubscriptionsForExport: vi.fn(async () => [] as unknown[]), adminSubscriptionsCsv: vi.fn(() => "csv export"),
  deleteUnpaidSubscription: vi.fn(async () => true), markSubscriptionPaid: vi.fn(async () => true),
  markSubscriptionUnpaid: vi.fn(async () => true), deleteAdminSubscription: vi.fn(async () => true),
}));
vi.mock("../lib/session.server", () => ({ requireUserId: mocks.requireUserId, requireAdminUser: mocks.requireAdminUser, isAdminRole: (role: string) => role === "admin" }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.findUserById }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/site-settings.server", () => ({ getRoleFeatureAccessSettings: mocks.getRoleFeatureAccessSettings }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.consumeUsageLimit, requestBodyExceedsLimit: mocks.requestBodyExceedsLimit }));
vi.mock("../lib/customer-subscriptions.server", async original => ({
  ...await original<typeof import("../lib/customer-subscriptions.server")>(),
  listCustomerSubscriptions: mocks.listCustomerSubscriptions, listAdminSubscriptions: mocks.listAdminSubscriptions,
  listAdminSubscriptionsForExport: mocks.listAdminSubscriptionsForExport, adminSubscriptionsCsv: mocks.adminSubscriptionsCsv,
  deleteUnpaidSubscription: mocks.deleteUnpaidSubscription, markSubscriptionPaid: mocks.markSubscriptionPaid,
  markSubscriptionUnpaid: mocks.markSubscriptionUnpaid, deleteAdminSubscription: mocks.deleteAdminSubscription,
}));
import { action as customerAction, loader as customerLoader } from "./dashboard-subscriptions";
import { action as adminAction, loader as adminLoader } from "./admin-subscriptions";
import { loader as adminExportLoader } from "./admin-subscriptions-export";
const args = (values?: Record<string, string>, query = "") => ({
  request: new Request(`http://localhost:3002/dashboard/subscriptions${query}`, values ? { method: "POST", body: new URLSearchParams(values) } : {}),
  url: new URL(`http://localhost:3002/dashboard/subscriptions${query}`), pattern: "/dashboard/subscriptions", params: {}, context: {},
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeUsageLimit.mockResolvedValue("allowed"); mocks.requestBodyExceedsLimit.mockReturnValue(false);
  mocks.requireAdminUser.mockResolvedValue({ id: "admin-id", role: "admin", active: true, email: "admin@example.test", name: "Admin", passwordHash: "secret" });
  mocks.getRoleFeatureAccessSettings.mockResolvedValue({ customer: ["overview", "billing"] });
  mocks.deleteUnpaidSubscription.mockResolvedValue(true); mocks.markSubscriptionPaid.mockResolvedValue(true);
  mocks.markSubscriptionUnpaid.mockResolvedValue(true); mocks.deleteAdminSubscription.mockResolvedValue(true);
  mocks.listCustomerSubscriptions.mockResolvedValue([]); mocks.listAdminSubscriptions.mockResolvedValue([]);
  mocks.listAdminSubscriptionsForExport.mockResolvedValue([]); mocks.adminSubscriptionsCsv.mockReturnValue("csv export");
  mocks.subscriptionSummaryRows = [{ total: 3, paid: 1, unpaid: 2 }];
});
describe("customer subscription route", () => {
  it("uses the authenticated owner and does not serialize password hashes", async () => {
    const result = await customerLoader(args(undefined, "?page=2&ownerId=foreign"));
    expect(mocks.listCustomerSubscriptions).toHaveBeenCalledWith(expect.anything(), "customer-id", 2);
    expect(result.user).not.toHaveProperty("passwordHash");
  });
  it("deletes only through the owner-scoped helper", async () => {
    expect(await customerAction(args({ intent: "delete-unpaid", subscriptionId: "sub-id", ownerId: "foreign" }))).toHaveProperty("success");
    expect(mocks.deleteUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), "customer-id", "sub-id");
  });
  it("cannot mark a subscription paid", async () => {
    expect(await customerAction(args({ intent: "mark-paid", subscriptionId: "sub-id" }))).toHaveProperty("error");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled(); expect(mocks.deleteUnpaidSubscription).not.toHaveBeenCalled();
  });
  it("handles unavailable records", async () => {
    mocks.deleteUnpaidSubscription.mockResolvedValue(false);
    expect(await customerAction(args({ intent: "delete-unpaid", subscriptionId: "sub-id" }))).toHaveProperty("error");
  });
  it("enforces feature access on reads and writes", async () => {
    mocks.getRoleFeatureAccessSettings.mockResolvedValue({ customer: ["overview"] });
    await expect(customerLoader(args())).rejects.toMatchObject({ status: 302 });
    await expect(customerAction(args({ intent: "delete-unpaid" }))).rejects.toMatchObject({ status: 302 });
    expect(mocks.listCustomerSubscriptions).not.toHaveBeenCalled(); expect(mocks.deleteUnpaidSubscription).not.toHaveBeenCalled();
  });
  it("has bounded pagination", async () => {
    mocks.listCustomerSubscriptions.mockResolvedValue(Array.from({ length: 26 }, (_, id) => ({ id })));
    const result = await customerLoader(args());
    expect(result.records).toHaveLength(25); expect(result.hasNext).toBe(true);
  });
});
describe("admin subscription route", () => {
  it("lists records without sending private admin fields", async () => {
    const result = await adminLoader(args());
    expect(mocks.listAdminSubscriptions).toHaveBeenCalledWith(expect.anything(), 1, "unpaid");
    expect(result.admin).not.toHaveProperty("passwordHash");
    expect(result.status).toBe("unpaid");
    expect(result.summary).toEqual({ total: 3, paid: 1, unpaid: 2 });
  });
  it("applies paid filtering before pagination", async () => {
    mocks.subscriptionSummaryRows = [{ total: 81, paid: 51, unpaid: 30 }];
    const result = await adminLoader(args(undefined, "?status=paid&page=2"));
    expect(mocks.listAdminSubscriptions).toHaveBeenCalledWith(expect.anything(), 2, "paid");
    expect(result.status).toBe("paid"); expect(result.page).toBe(2);
  });
  it("clamps an out-of-range page to the last page for the selected status", async () => {
    mocks.subscriptionSummaryRows = [{ total: 26, paid: 0, unpaid: 26 }];
    const result = await adminLoader(args(undefined, "?status=unpaid&page=4"));
    expect(result.page).toBe(2);
    expect(mocks.listAdminSubscriptions).toHaveBeenNthCalledWith(1, expect.anything(), 4, "unpaid");
    expect(mocks.listAdminSubscriptions).toHaveBeenNthCalledWith(2, expect.anything(), 2, "unpaid");
  });
  it("downloads the full CSV for the selected status with safe attachment headers", async () => {
    const result = await adminExportLoader(args(undefined, "?status=paid"));
    expect(mocks.listAdminSubscriptionsForExport).toHaveBeenCalledWith(expect.anything(), "paid");
    expect(mocks.listAdminSubscriptions).not.toHaveBeenCalled();
    expect(result.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="orders-paid.csv"');
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await result.text()).toBe("csv export");
  });
  it("defaults CSV downloads to all purchases", async () => {
    const result = await adminExportLoader(args());
    expect(mocks.listAdminSubscriptionsForExport).toHaveBeenCalledWith(expect.anything(), "all");
    expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="orders.csv"');
  });
  it("exports all purchases when the status query is invalid", async () => {
    await adminExportLoader(args(undefined, "?status=other"));
    expect(mocks.listAdminSubscriptionsForExport).toHaveBeenCalledWith(expect.anything(), "all");
  });
  it("records the authenticated admin, not a submitted admin id", async () => {
    const result = await adminAction(args({ intent: "mark-paid", subscriptionId: "sub-id", paidBy: "foreign", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }));
    expect(result).toHaveProperty("success");
    expect(mocks.markSubscriptionPaid).toHaveBeenCalledWith(expect.anything(), "sub-id", "admin-id", "2026-10-03T00:00:00.000Z");
  });
  it("sets a paid purchase to unpaid using its displayed revision", async () => {
    const result = await adminAction(args({ intent: "mark-unpaid", subscriptionId: "sub-id", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }));
    expect(result).toHaveProperty("success", "Order marked unpaid. Paid access has been removed.");
    expect(mocks.markSubscriptionUnpaid).toHaveBeenCalledWith(expect.anything(), "sub-id", "2026-10-03T00:00:00.000Z");
  });
  it("deletes purchases through the guarded admin helper", async () => {
    const result = await adminAction(args({ intent: "delete-purchase", subscriptionId: "sub-id", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }));
    expect(result).toHaveProperty("success", "Order removed from the ledger.");
    expect(mocks.deleteAdminSubscription).toHaveBeenCalledWith(expect.anything(), "sub-id", "2026-10-03T00:00:00.000Z");
  });
  it("explains when a purchase cannot be changed after project work", async () => {
    mocks.markSubscriptionUnpaid.mockResolvedValue(false);
    mocks.deleteAdminSubscription.mockResolvedValue(false);
    expect(await adminAction(args({ intent: "mark-unpaid", subscriptionId: "sub-id", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }))).toHaveProperty("error", expect.stringContaining("project work"));
    expect(await adminAction(args({ intent: "delete-purchase", subscriptionId: "sub-id", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }))).toHaveProperty("error", expect.stringContaining("project work"));
  });
  it.each([{ role: "customer", active: true }, { role: "admin", active: false }])("rejects unauthorized or inactive admin %j", async input => {
    mocks.requireAdminUser.mockResolvedValue({ id: "admin-id", email: "a@example.test", name: "Admin", passwordHash: "secret", ...input });
    await expect(adminAction(args({ intent: "mark-paid" }))).rejects.toMatchObject({ status: 403 });
    await expect(adminLoader(args())).rejects.toMatchObject({ status: 403 });
    await expect(adminExportLoader(args())).rejects.toMatchObject({ status: 403 });
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled(); expect(mocks.markSubscriptionUnpaid).not.toHaveBeenCalled();
    expect(mocks.deleteAdminSubscription).not.toHaveBeenCalled(); expect(mocks.listAdminSubscriptions).not.toHaveBeenCalled();
    expect(mocks.listAdminSubscriptionsForExport).not.toHaveBeenCalled();
  });
  it("rejects unsupported changes", async () => {
    expect(await adminAction(args({ intent: "delete-unpaid" }))).toHaveProperty("error");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled();
  });
});
describe.each([["customer", customerAction], ["admin", adminAction]] as const)("%s request protections", (_name, action) => {
  it("rejects cross-origin actions", async () => {
    const input = args({ intent: "mark-paid" }); input.request.headers.set("Origin", "https://foreign.test");
    expect(await action(input)).toHaveProperty("error");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled(); expect(mocks.markSubscriptionUnpaid).not.toHaveBeenCalled();
    expect(mocks.deleteAdminSubscription).not.toHaveBeenCalled(); expect(mocks.deleteUnpaidSubscription).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies", async () => {
    mocks.requestBodyExceedsLimit.mockReturnValue(true);
    expect(await action(args({ intent: "mark-paid" }))).toHaveProperty("error");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled(); expect(mocks.markSubscriptionUnpaid).not.toHaveBeenCalled();
    expect(mocks.deleteAdminSubscription).not.toHaveBeenCalled(); expect(mocks.deleteUnpaidSubscription).not.toHaveBeenCalled();
  });
  it.each(["limited", "unavailable"])("does not write when rate protection is %s", async limit => {
    mocks.consumeUsageLimit.mockResolvedValue(limit);
    expect(await action(args({ intent: "delete-unpaid" }))).toHaveProperty("error");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled(); expect(mocks.markSubscriptionUnpaid).not.toHaveBeenCalled();
    expect(mocks.deleteAdminSubscription).not.toHaveBeenCalled(); expect(mocks.deleteUnpaidSubscription).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  list: vi.fn(),
  features: ["overview", "billing"],
  user: { id: "customer-1", name: "Client", email: "client@example.com", active: true, deletedAt: null, role: "customer", profileImageUrl: null },
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db, hasReturnedRows: () => false }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: async () => mocks.user }));
vi.mock("../lib/session.server", () => ({ requireUserId: async () => mocks.user.id }));
vi.mock("../lib/site-settings.server", () => ({ getRoleFeatureAccessSettings: async () => ({}) }));
vi.mock("../lib/role-feature-access", () => ({ getAllowedDashboardFeatures: () => mocks.features, getDashboardLandingPath: () => "/dashboard" }));
vi.mock("../lib/customer-subscriptions.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/customer-subscriptions.server")>(),
  listCustomerSubscriptions: mocks.list,
}));

import { loader } from "./dashboard-subscriptions";

const args = () => ({ request: new Request("http://localhost:3002/dashboard/subscriptions?page=2"), params: {}, context: {} }) as Parameters<typeof loader>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features = ["overview", "billing"];
});

describe("purchase history availability", () => {
  it("keeps navigation available without showing a false empty history when the purchase migration is missing", async () => {
    mocks.list.mockRejectedValue({ message: 'Failed query: select from "customer_subscriptions"', cause: { code: "42703", message: 'column "purchase_type" does not exist' } });
    expect(await loader(args())).toMatchObject({ purchaseHistoryAvailable: false, records: [], hasNext: false, page: 2, features: ["overview", "billing"] });
  });

  it("preserves owner filtering and pagination when purchase history is available", async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 26 }, (_, id) => ({ id })));
    const result = await loader(args());
    expect(mocks.list).toHaveBeenCalledWith(mocks.db, "customer-1", 2);
    expect(result.purchaseHistoryAvailable).toBe(true);
    expect(result.records).toHaveLength(25);
    expect(result.hasNext).toBe(true);
  });

  it("does not disguise unexpected database failures as a missing migration", async () => {
    const error = new Error("database unavailable");
    mocks.list.mockRejectedValue(error);
    await expect(loader(args())).rejects.toBe(error);
  });

  it("does not read purchase history for roles without billing access", async () => {
    mocks.features = ["overview"];
    await expect(loader(args())).rejects.toMatchObject({ status: 302 });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

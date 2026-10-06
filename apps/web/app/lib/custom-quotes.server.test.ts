import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import { customQuoteInputSchema } from "@edicut/shared/contracts/custom-quotes";
const mocks = vi.hoisted(() => ({ userId: vi.fn(), findUser: vi.fn(), db: {} }));
vi.mock("./session.server", () => ({ requireUserId: mocks.userId }));
vi.mock("./db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.findUser }));
import { getCustomerQuote, requireQuoteCustomer, saveCustomQuote } from "./custom-quotes.server";
const customer = { id: "11111111-1111-4111-8111-111111111111", name: "Client", email: "client@example.com" };
const id = "22222222-2222-4222-8222-222222222222";
const context = {} as Parameters<typeof requireQuoteCustomer>[1];
const input = customQuoteInputSchema.parse({ requestToken: id, title: "A new series", phone: "", preferredContact: "email", projectType: "youtube", requestType: "single", platforms: ["youtube"], videoCount: 1, duration: "5to15", footage: "unsure", cadence: "once", aspectRatios: ["landscape"], style: "recommend", services: ["cuts"], revisions: "recommend", urgency: "flexible", budget: "discuss", deadline: "", languages: "", channelUrl: "", footageUrl: "", referenceUrls: "", brief: "Create an educational edit with clean audio and pacing." });
function fakeDb(saved: unknown[] = [], existing: unknown[] = []) {
  const chain = { values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(async () => saved), from: vi.fn(), where: vi.fn(), limit: vi.fn(async () => existing) };
  chain.values.mockReturnValue(chain); chain.onConflictDoNothing.mockReturnValue(chain); chain.from.mockReturnValue(chain); chain.where.mockReturnValue(chain);
  const raw = { insert: vi.fn(() => chain), select: vi.fn((_columns?: unknown) => chain) };
  return { db: raw as unknown as DatabaseClient, raw, chain };
}
beforeEach(() => { vi.resetAllMocks(); mocks.userId.mockResolvedValue(customer.id); mocks.findUser.mockResolvedValue({ ...customer, active: true }); });
describe("quote ownership and persistence", () => {
  it.each([null, { ...customer, active: false }, { ...customer, active: true, deletedAt: new Date() }])("rejects unavailable accounts", async user => {
    mocks.findUser.mockResolvedValue(user);
    await expect(requireQuoteCustomer(new Request("http://localhost/custom-quote"), context)).rejects.toMatchObject({ status: 403 });
  });
  it("returns only public account details for an active signed-in customer", async () => {
    mocks.findUser.mockResolvedValue({ ...customer, active: true, passwordHash: "private" });
    const result = await requireQuoteCustomer(new Request("http://localhost/custom-quote"), context);
    expect(result.customer).toEqual({ ...customer, phone: "" });
    expect(mocks.userId).toHaveBeenCalledWith(expect.any(Request), {}, "/custom-quote");
  });
  it("snapshots account identity, defaults to new, and only returns an id", async () => {
    const { db, chain } = fakeDb([{ id, internalNotes: "secret" }]);
    expect(await saveCustomQuote(db, customer, input)).toEqual({ id });
    const snapshot = chain.values.mock.calls[0][0];
    expect(snapshot).toMatchObject({ ownerId: customer.id, customerEmail: customer.email, phone: null });
    expect(snapshot).not.toHaveProperty("status"); expect(snapshot.options).not.toHaveProperty("requestToken");
  });
  it("reuses duplicate submissions only within the same owner and token", async () => {
    const { db, chain } = fakeDb([], [{ id }]);
    expect(await saveCustomQuote(db, customer, input)).toEqual({ id });
    const compiled = new PgDialect().sqlToQuery(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([customer.id, input.requestToken]);
    expect(chain.onConflictDoNothing.mock.calls[0][0].target).toHaveLength(2);
  });
  it("limits confirmation reads to the owner and never selects internal notes", async () => {
    const { db, raw, chain } = fakeDb([], [{ id }]);
    await getCustomerQuote(db, customer.id, id);
    expect(new PgDialect().sqlToQuery(chain.where.mock.calls[0][0]).params).toEqual([id, customer.id]);
    expect(raw.select.mock.calls[0][0]).not.toHaveProperty("internalNotes");
  });
});

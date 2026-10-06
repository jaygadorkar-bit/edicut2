import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingPackage } from "../lib/pricing.server";

const mocks = vi.hoisted(() => {
  const profileUpdateWhere = vi.fn(async () => []);
  const profileUpdateSet = vi.fn(() => ({ where: profileUpdateWhere }));
  const profileUpdate = vi.fn(() => ({ set: profileUpdateSet }));
  const db = { insert: vi.fn(), execute: vi.fn(), update: profileUpdate };
  return {
  requireUserId: vi.fn(async () => "user-1"),
  consumeUsageLimit: vi.fn(async () => "allowed"),
  requestBodyExceedsLimit: vi.fn(() => false),
  getDbFromContext: vi.fn(() => db),
  profileUpdateSet,
  findAffiliateByCode: vi.fn(),
  findCouponForQuote: vi.fn(),
  getPricingPackages: vi.fn<() => Promise<PricingPackage[]>>(async () => []),
  getLatestCustomerContact: vi.fn(),
  getOwnedSubscription: vi.fn(),
  saveUnpaidSubscription: vi.fn(),
  queueTelegramOrderNotice: vi.fn(),
  };
});
vi.mock("../lib/session.server", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.consumeUsageLimit, requestBodyExceedsLimit: mocks.requestBodyExceedsLimit }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/customer-subscriptions.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/customer-subscriptions.server")>(),
  getLatestCustomerContact: mocks.getLatestCustomerContact,
  getOwnedSubscription: mocks.getOwnedSubscription,
  saveUnpaidSubscription: mocks.saveUnpaidSubscription,
}));
vi.mock("../lib/telegram-notifications.server", () => ({ queueTelegramOrderNotice: mocks.queueTelegramOrderNotice }));
vi.mock("../lib/pricing.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/pricing.server")>(),
  getPricingPackages: mocks.getPricingPackages,
}));
vi.mock("../lib/marketing.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/marketing.server")>(),
  findAffiliateByCode: mocks.findAffiliateByCode,
  findCouponForQuote: mocks.findCouponForQuote,
}));
import { defaultPricingPackages } from "../lib/pricing.server";
import { action, loader } from "./checkout";

function args(query = "", values?: Record<string, string>, slug = "creator-pro") {
  const body = values ? new URLSearchParams(values) : undefined;
  return { request: new Request(`http://localhost:3002/checkout/${slug}${query}`, body ? { method: "POST", body } : {}), url: new URL(`http://localhost:3002/checkout/${slug}${query}`), pattern: "/checkout/:slug", params: { slug }, context: {} } as Parameters<typeof loader>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.requestBodyExceedsLimit.mockReturnValue(false);
  mocks.findCouponForQuote.mockResolvedValue({ error: "Coupon not found." });
  mocks.getPricingPackages.mockResolvedValue(defaultPricingPackages);
  mocks.findAffiliateByCode.mockResolvedValue(null);
  mocks.getLatestCustomerContact.mockResolvedValue(null);
  mocks.getOwnedSubscription.mockResolvedValue({ id: "saved-id", status: "unpaid", amountCents: 314900, country: "BD", phone: "+8801712345678" });
  mocks.saveUnpaidSubscription.mockResolvedValue({ id: "saved-id", planName: "Studio", amountCents: 314900, currency: "USD" });
});

describe("payment-first checkout", () => {
  it("loads both add-ons at server prices and quotes the full subtotal", async () => {
    const result = await loader(args("?addon=thumbnail&addon=short-form&coupon=SAVE10&amountCents=1", undefined, "single-creator"));
    expect(result.total).toBe(149);
    expect(result.addOns).toHaveLength(2);
    expect(mocks.findCouponForQuote).toHaveBeenCalledWith(expect.anything(), "SAVE10", 14900, "user-1");
  });
  it("saves priced add-on snapshots and includes them in the order notice", async () => {
    mocks.saveUnpaidSubscription.mockResolvedValueOnce({ id: "saved-id", planName: "Creator Video", amountCents: 12900, currency: "USD" });
    await action(args("", { intent: "start-checkout", packageSlug: "single-creator", country: "US", phone: "+12025550123", addon: "thumbnail", addOnPrice: "1", amountCents: "1" }, "single-creator"));
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subtotalCents: 12900, amountCents: 12900, addOns: [{ id: "thumbnail", label: "Custom thumbnail", amountCents: 2000 }] }));
    expect(mocks.queueTelegramOrderNotice).toHaveBeenCalledWith({}, expect.objectContaining({ summary: "Single video edit: Creator Video + Custom thumbnail" }));
  });
  it("rejects unknown add-ons before any save or coupon lookup", async () => {
    expect(await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "US", phone: "+12025550123", addon: "free-upgrade" }))).toMatchObject({ error: expect.stringContaining("valid package add-ons") });
    expect(mocks.saveUnpaidSubscription).not.toHaveBeenCalled();
    expect(mocks.findCouponForQuote).not.toHaveBeenCalled();
  });
  it("quotes coupon previews with selected extras and returns the quoted subtotal", async () => {
    mocks.findCouponForQuote.mockResolvedValueOnce({ coupon: { code: "SAVE10" }, discountCents: 1290, discountedTotalCents: 11610 });
    const result = await action(args("", { intent: "validate-coupon", packageSlug: "single-creator", couponCode: "SAVE10", addon: "short-form" }, "single-creator"));
    expect(result).toMatchObject({ couponPreview: { subtotalCents: 12900 } });
    expect(mocks.findCouponForQuote).toHaveBeenCalledWith(expect.anything(), "SAVE10", 12900, "user-1");
  });
  it("loads payment totals and add-ons from the saved snapshot despite URL and catalog price changes", async () => {
    mocks.getOwnedSubscription.mockResolvedValueOnce({ id: "saved-id", status: "unpaid", subtotalCents: 12900, amountCents: 12900, addOns: [{ id: "thumbnail", label: "Custom thumbnail", amountCents: 2000 }] });
    const result = await loader(args("?step=payment&subscription=saved-id&addon=short-form&amount=1", undefined, "single-creator"));
    expect(result.total).toBe(129);
    expect(result.addOns.map(item => item.id)).toEqual(["thumbnail"]);
  });
  it("restores saved add-ons on return to review", async () => {
    mocks.getOwnedSubscription.mockResolvedValueOnce({ id: "saved-id", status: "unpaid", addOns: [{ id: "short-form", label: "Short-form video", amountCents: 2000 }] });
    expect((await loader(args("?subscription=saved-id", undefined, "single-creator"))).total).toBe(129);
  });
  it("loads plan review from the configured package catalog", async () => {
    const result = await loader(args());
    expect(result.editingPackage.name).toBe("Studio");
    expect(result.total).toBe(3149);
    expect(result.paymentStep).toBe(false);
    expect(mocks.getPricingPackages).toHaveBeenCalledOnce();
    expect(mocks.requireUserId).toHaveBeenCalled();
  });

  it("prefills contact details from the authenticated customer's latest purchase", async () => {
    mocks.getLatestCustomerContact.mockResolvedValueOnce({ country: "BD", phone: "+8801712345678" });
    const result = await loader(args());
    expect(result.customerContact).toEqual({ country: "BD", phone: "+8801712345678" });
    expect(mocks.getLatestCustomerContact).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("uses the selected saved purchase's contact instead of loading a different default", async () => {
    mocks.getOwnedSubscription.mockResolvedValueOnce({ id: "saved-id", status: "unpaid", amountCents: 314900, country: "US", phone: "+12025550123" });
    const result = await loader(args("?subscription=saved-id"));
    expect(result.savedSubscription).toMatchObject({ country: "US", phone: "+12025550123" });
    expect(result.customerContact).toBeNull();
    expect(mocks.getLatestCustomerContact).not.toHaveBeenCalled();
  });

  it("loads only an owned saved payment record and ignores client amount/status", async () => {
    const result = await loader(args("?step=payment&subscription=saved-id&ref=partner-1&amount=1&paid=true"));
    expect(result.paymentStep).toBe(true);
    expect(result.total).toBe(3149);
    expect(result.affiliateCode).toBe("PARTNER-1");
    expect(mocks.getOwnedSubscription).toHaveBeenCalledWith(expect.anything(), "user-1", "saved-id", "creator-pro");
    expect(result.savedSubscription?.amountCents).toBe(314900);
  });

  it("rejects unknown plans", async () => {
    await expect(loader({ ...args(), params: { slug: "invalid-plan" } })).rejects.toMatchObject({ status: 404 });
  });

  it("does not serve the retired short-form package", async () => {
    await expect(loader(args("", undefined, "single-short"))).rejects.toMatchObject({ status: 404 });
  });

  it("loads the larger one-time Feature Video offer at its catalog price", async () => {
    const result = await loader(args("", undefined, "single-feature"));
    expect(result.editingPackage).toMatchObject({ slug: "single-feature", name: "Feature Video", finishedLength: "Up to 30 minutes" });
    expect(result.total).toBe(249);
  });

  it("does not serve a package hidden in admin pricing settings", async () => {
    mocks.getPricingPackages.mockResolvedValueOnce(defaultPricingPackages.map(item => item.slug === "single-feature" ? { ...item, active: false } : item));
    await expect(loader(args("", undefined, "single-feature"))).rejects.toMatchObject({ status: 404 });
  });

  it("uses an admin-configured price instead of trusting a posted amount", async () => {
    mocks.getPricingPackages.mockResolvedValue(defaultPricingPackages.map(item => item.slug === "creator-pro" ? { ...item, price: "$1,599" } : item));
    expect((await loader(args())).total).toBe(1599);
    const response = await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "US", phone: "+12025550123", amountCents: "1" }));
    expect(response).toBeInstanceOf(Response);
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subtotalCents: 159900, amountCents: 159900 }));
  });

  it("saves a one-time video checkout with its purchase type and one-time price", async () => {
    mocks.saveUnpaidSubscription.mockResolvedValueOnce({ id: "saved-id", planName: "Creator Video", amountCents: 10900, currency: "USD" });
    const response = await action(args("", { intent: "start-checkout", packageSlug: "single-creator", country: "US", phone: "+12025550123" }, "single-creator"));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/checkout/single-creator?step=payment&subscription=saved-id");
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      packageSlug: "single-creator", planName: "Creator Video", purchaseType: "single",
      subtotalCents: 10900, amountCents: 10900, discountCents: 0,
    }));
    expect(mocks.queueTelegramOrderNotice).toHaveBeenCalledWith({}, expect.objectContaining({
      kind: "single", summary: "Single video edit: Creator Video", amountCents: 10900,
    }));
  });

  it("saves a Feature Video checkout with its canonical one-time price", async () => {
    mocks.saveUnpaidSubscription.mockResolvedValueOnce({ id: "saved-id", planName: "Feature Video", amountCents: 24900, currency: "USD" });
    const response = await action(args("", { intent: "start-checkout", packageSlug: "single-feature", country: "US", phone: "+12025550123" }, "single-feature"));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/checkout/single-feature?step=payment&subscription=saved-id");
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      packageSlug: "single-feature", planName: "Feature Video", purchaseType: "single",
      subtotalCents: 24900, amountCents: 24900, discountCents: 0,
    }));
  });

  it.each<Record<string, string>>([{}, { intent: "pay", paid: "true" }, { channelName: "Old quote form", billingEmail: "test@example.com" }])("blocks purchases and legacy quote submissions without database writes: %j", async values => {
    const response = await action(args("", values));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).json()).toEqual({ error: "Payment gateway under construction. Card payments are not available yet." });
    expect(mocks.getDbFromContext).not.toHaveBeenCalled();
    expect(mocks.findCouponForQuote).not.toHaveBeenCalled();
  });

  it("revalidates coupon discounts on the payment step using the canonical subtotal", async () => {
    mocks.findCouponForQuote.mockResolvedValue({ coupon: { code: "SAVE10" }, discountCents: 31490, discountedTotalCents: 283410 });
    const result = await loader(args("?coupon=save10&discount=999999"));
    expect(result.coupon.couponPreview?.discountedTotalCents).toBe(283410);
    expect(mocks.findCouponForQuote).toHaveBeenCalledWith(expect.anything(), "SAVE10", 314900, "user-1");
  });

  it("keeps missing coupon tables as an inline error", async () => {
    mocks.findCouponForQuote.mockRejectedValue({ cause: { code: "42P01", message: 'relation "marketing_coupons" does not exist' } });
    const result = await action(args("", { intent: "validate-coupon", packageSlug: "creator-pro", couponCode: "SAVE10" }));
    expect(result).toMatchObject({ couponCode: "SAVE10", couponError: expect.stringContaining("temporarily unavailable") });
  });

  it("rejects a coupon preview for a different package", async () => {
    const result = await action(args("", { intent: "validate-coupon", packageSlug: "creator", couponCode: "SAVE10" }));
    expect(result).toMatchObject({ couponError: expect.stringContaining("valid package") });
    expect(mocks.findCouponForQuote).not.toHaveBeenCalled();
  });

  it("stops coupon queries when usage protection blocks the request", async () => {
    mocks.consumeUsageLimit.mockResolvedValue("limited");
    const result = await action(args("", { intent: "validate-coupon", packageSlug: "creator-pro", couponCode: "SAVE10" }));
    expect(result).toMatchObject({ error: expect.stringContaining("Wait a minute") });
    expect(mocks.getDbFromContext).not.toHaveBeenCalled();
  });

  it("also limits coupon checks loaded through the payment URL", async () => {
    mocks.consumeUsageLimit.mockResolvedValue("limited");
    const result = await loader(args("?coupon=SAVE10"));
    expect(result.coupon).toMatchObject({ couponCode: "SAVE10", couponError: expect.stringContaining("Wait a minute") });
    expect(mocks.findCouponForQuote).not.toHaveBeenCalled();
  });

  it("redirects missing, deleted, or another customer's subscription to review without creating data", async () => {
    mocks.getOwnedSubscription.mockResolvedValue(null);
    await expect(loader(args("?step=payment&subscription=other-id&ref=partner-1"))).rejects.toMatchObject({ status: 302 });
    expect(mocks.saveUnpaidSubscription).not.toHaveBeenCalled();
  });

  it("redirects an already paid subscription to channel setup and projects", async () => {
    mocks.getOwnedSubscription.mockResolvedValue({ status: "paid" });
    await expect(loader(args("?step=payment&subscription=saved-id"))).rejects.toMatchObject({ status: 302 });
  });

  it("saves validated details as unpaid using the canonical price and redirects to the saved record", async () => {
    mocks.findAffiliateByCode.mockResolvedValue({ id: "affiliate-1", code: "PARTNER-1", commissionRateBps: 1250 });
    const response = await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "bd", phone: "+880 1712 345678", amountCents: "1", status: "paid", affiliateCode: "partner-1" }));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/checkout/creator-pro?step=payment&subscription=saved-id");
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), {
      ownerId: "user-1", packageSlug: "creator-pro", planName: "Studio", country: "BD", phone: "+8801712345678",
      subtotalCents: 314900, amountCents: 314900, discountCents: 0, couponCode: null, purchaseType: "monthly",
      affiliateId: "affiliate-1", affiliateCode: "PARTNER-1", affiliateCommissionBps: 1250,
      addOns: [],
    });
    expect(mocks.profileUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      phone: "+8801712345678", country: "Bangladesh", updatedAt: expect.any(Date),
    }));
    expect(mocks.queueTelegramOrderNotice).toHaveBeenCalledWith({}, {
      orderId: "saved-id", kind: "subscription", summary: "Monthly editing package: Studio", amountCents: 314900, currency: "USD",
    });
  });

  it.each([{ country: "", phone: "+8801712345678" }, { country: "INVALID", phone: "+8801712345678" }, { country: "BD", phone: "1234" }])("rejects invalid contact details without database writes: %j", async values => {
    expect(await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", ...values }))).toMatchObject({ error: expect.any(String) });
    expect(mocks.saveUnpaidSubscription).not.toHaveBeenCalled();
    expect(mocks.queueTelegramOrderNotice).not.toHaveBeenCalled();
  });

  it("revalidates a coupon on save and does not trust posted discounts", async () => {
    mocks.findCouponForQuote.mockResolvedValue({ coupon: { code: "SAVE10" }, discountCents: 31490, discountedTotalCents: 283410 });
    await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "US", phone: "+12025550123", couponCode: "save10", discountCents: "100000" }));
    expect(mocks.saveUnpaidSubscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 283410, discountCents: 31490, couponCode: "SAVE10", purchaseType: "monthly" }));
  });

  it("rejects expired or unavailable coupons before saving", async () => {
    const result = await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "US", phone: "+12025550123", couponCode: "EXPIRED" }));
    expect(result).toMatchObject({ error: "Coupon not found." });
    expect(mocks.saveUnpaidSubscription).not.toHaveBeenCalled();
    expect(mocks.queueTelegramOrderNotice).not.toHaveBeenCalled();
  });

  it("reports a save failure without showing database details", async () => {
    mocks.saveUnpaidSubscription.mockRejectedValueOnce(new Error("private database details"));
    expect(await action(args("", { intent: "start-checkout", packageSlug: "creator-pro", country: "US", phone: "+12025550123" }))).toMatchObject({ error: expect.stringContaining("could not be saved") });
    expect(mocks.queueTelegramOrderNotice).not.toHaveBeenCalled();
  });

  it("rejects cross-origin checkout posts", async () => {
    const input = args("", { intent: "start-checkout" });
    input.request.headers.set("Origin", "https://attacker.example");
    expect(await action(input)).toMatchObject({ status: 403 });
    expect(mocks.saveUnpaidSubscription).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn(), save: vi.fn(), getOwned: vi.fn(), limit: vi.fn(), captcha: vi.fn(), getPricingPackages: vi.fn(),
}));
vi.mock("../lib/custom-quotes.server", () => ({ requireQuoteCustomer: mocks.requireCustomer, saveCustomQuote: mocks.save, getCustomerQuote: mocks.getOwned, quoteBusinessDate: () => "2026-10-04" }));
vi.mock("../lib/usage-protection.server", async original => ({ ...await original<typeof import("../lib/usage-protection.server")>(), consumeUsageLimit: mocks.limit }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.captcha }));
vi.mock("../lib/pricing.server", async original => ({ ...await original<typeof import("../lib/pricing.server")>(), getPricingPackages: mocks.getPricingPackages }));
import { defaultPricingPackages } from "../lib/pricing.server";
import { action, loader, headers } from "./custom-quote";
const id = "22222222-2222-4222-8222-222222222222";
const customer = { id: "customer-1", name: "Customer", email: "customer@example.com", phone: "" };
const valid = { requestToken: id, title: "Our documentary", phone: "", preferredContact: "email", projectType: "documentary", requestType: "single", platforms: "youtube", videoCount: "1", duration: "15to30", footage: "1to3h", cadence: "once", aspectRatios: "landscape", style: "documentary", services: "cuts", revisions: "recommend", urgency: "flexible", budget: "discuss", deadline: "", languages: "", channelUrl: "", footageUrl: "", referenceUrls: "", brief: "Please edit our documentary for a YouTube audience.", "g-recaptcha-response": "valid-token" };
function args(fields?: Record<string, string>, query = "", extraHeaders?: Record<string, string>) {
  return { request: new Request(`http://localhost:3002/custom-quote${query}`, fields ? { method: "POST", headers: extraHeaders, body: new URLSearchParams(fields) } : {}), params: {}, context: {} } as Parameters<typeof loader>[0];
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.requireCustomer.mockResolvedValue({ db: {}, customer }); mocks.save.mockResolvedValue({ id }); mocks.getOwned.mockResolvedValue(null); mocks.limit.mockResolvedValue("allowed"); mocks.captcha.mockResolvedValue({ success: true });
  mocks.getPricingPackages.mockResolvedValue(defaultPricingPackages);
});
describe("authenticated custom quote route", () => {
  it("uses the configured monthly plan name and ignores inactive plans", async () => {
    mocks.getPricingPackages.mockResolvedValueOnce(defaultPricingPackages.map(pack => pack.slug === "creator-plus" ? { ...pack, name: "Channel Growth" } : pack));
    expect((await loader(args(undefined, "?package=creator-plus&monthly-addon=extra-editing-hours"))).prefill?.title).toBe("Channel Growth: Extra editing hours");
    mocks.getPricingPackages.mockResolvedValueOnce(defaultPricingPackages.map(pack => pack.slug === "creator-plus" ? { ...pack, active: false } : pack));
    expect((await loader(args(undefined, "?package=creator-plus&monthly-addon=extra-editing-hours"))).prefill).toBeNull();
  });
  it.each([
    ["extra-editing-hours", "Extra editing hours", "cuts"],
    ["thumbnail-bundle", "Monthly thumbnail bundle", "thumbnails"],
  ])("prefills the %s quote for a monthly plan without creating a request", async (id, label, service) => {
    const result = await loader(args(undefined, `?package=creator-plus&monthly-addon=${id}`));
    expect(result.prefill).toMatchObject({ title: `Growth: ${label}`, requestType: "recurring", cadence: "monthly", services: [service] });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([
    "?package=single-creator&monthly-addon=thumbnail-bundle",
    "?package=unknown&monthly-addon=extra-editing-hours",
    "?package=creator-plus&monthly-addon=free-upgrade&price=0&title=forged",
  ])("ignores unsupported monthly quote parameters: %s", async query => {
    expect((await loader(args(undefined, query))).prefill).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires customer authentication for both viewing and submitting", async () => {
    mocks.requireCustomer.mockRejectedValue(new Response(null, { status: 302, headers: { Location: "/signin?redirectTo=%2Fcustom-quote" } }));
    await expect(loader(args())).rejects.toMatchObject({ status: 302 });
    await expect(action(args(valid))).rejects.toMatchObject({ status: 302 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects cross-site and oversized bodies before saving", async () => {
    expect(await action(args(valid, "", { Origin: "https://evil.example" }))).toMatchObject({ init: { status: 403 } });
    expect(await action(args({ ...valid, brief: "a".repeat(34000) }))).toMatchObject({ init: { status: 400 } });
    expect(await action(args(valid, "", { "Content-Length": "200000" }))).toMatchObject({ init: { status: 413 } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("returns inline errors for invalid choices and past dates", async () => {
    expect(await action(args({ ...valid, services: "free" }))).toMatchObject({ data: { fieldErrors: { services: expect.any(String) } }, init: { status: 400 } });
    expect(await action(args({ ...valid, deadline: "2026-10-03" }))).toMatchObject({ data: { fieldErrors: { deadline: expect.any(String) } }, init: { status: 400 } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("accepts a maximum-length Bengali brief despite URL encoding exceeding 32 KB", async () => {
    const response = await action(args({ ...valid, brief: "আ".repeat(6000) }));
    expect(response).toBeInstanceOf(Response);
    expect(mocks.save).toHaveBeenCalledWith({}, customer, expect.objectContaining({ brief: "আ".repeat(6000) }));
  });
  it("bounds streamed bodies even when Content-Length is omitted", async () => {
    expect(await action(args({ ...valid, brief: "a".repeat(140000) }))).toMatchObject({ init: { status: 400 } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires both rate-limit allowance and CAPTCHA verification", async () => {
    mocks.limit.mockResolvedValueOnce("denied");
    expect(await action(args(valid))).toMatchObject({ init: { status: 429 } });
    expect(mocks.captcha).not.toHaveBeenCalled();
    mocks.captcha.mockResolvedValueOnce({ success: false, error: "Expired" });
    expect(await action(args(valid))).toMatchObject({ init: { status: 400 } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses account identity and ignores forged owner, price, and status", async () => {
    const response = await action(args({ ...valid, ownerId: "another-user", email: "forged@example.com", status: "closed", price: "1" }));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe(`/custom-quote?submitted=${id}`);
    expect(mocks.save).toHaveBeenCalledWith({}, customer, expect.objectContaining({ title: valid.title, platforms: ["youtube"], services: ["cuts"] }));
    expect(mocks.save.mock.calls[0][2]).not.toHaveProperty("ownerId");
  });
  it("confirms only requests owned by the signed-in customer", async () => {
    await expect(loader(args(undefined, `?submitted=${id}`))).rejects.toMatchObject({ status: 404 });
    expect(mocks.getOwned).toHaveBeenCalledWith({}, customer.id, id);
    mocks.getOwned.mockResolvedValue({ id, title: "Saved" });
    expect(await loader(args(undefined, `?submitted=${id}`))).toMatchObject({ submitted: { id } });
    await expect(loader(args(undefined, "?submitted=invalid"))).rejects.toMatchObject({ status: 404 });
    expect(headers()["Cache-Control"]).toBe("no-store");
  });
  it("reports a save outage without leaking database details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.save.mockRejectedValue(new Error("database secret"));
    expect(await action(args(valid))).toMatchObject({ data: { error: expect.stringContaining("try again") }, init: { status: 503 } });
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("database secret")); consoleError.mockRestore();
  });
});

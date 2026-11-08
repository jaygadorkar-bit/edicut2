import { describe, expect, it, vi } from "vitest";
import { isCheckoutDemoMode } from "./checkout-demo.server";

describe("checkout demo mode gate", () => {
  it("enables the demo on loopback only when the server flag is explicit", () => {
    expect(isCheckoutDemoMode({ cf: { env: { CHECKOUT_DEMO_MODE: "true" } } }, "http://localhost:3002/checkout/creator")).toBe(true);
    expect(isCheckoutDemoMode({ cf: { env: { CHECKOUT_DEMO_MODE: "TRUE" } } }, "http://127.0.0.1:3002/checkout/creator")).toBe(true);
    expect(isCheckoutDemoMode({ cf: { env: { CHECKOUT_DEMO_MODE: "false" } } }, "http://localhost:3002/checkout/creator")).toBe(false);
  });

  it("allows an explicit demo query only on loopback", () => {
    expect(isCheckoutDemoMode({}, "http://localhost:3002/checkout/creator?demo=1")).toBe(true);
    expect(isCheckoutDemoMode({}, "https://preview.edicut.test/checkout/creator?demo=1")).toBe(false);
    expect(isCheckoutDemoMode({}, "https://edicut.com/checkout/creator?demo=1")).toBe(false);
  });

  it("falls back to the server process flag when a runtime binding is empty", () => {
    vi.stubEnv("CHECKOUT_DEMO_MODE", "true");
    try {
      expect(isCheckoutDemoMode({ cf: { env: { CHECKOUT_DEMO_MODE: "" } } }, "http://localhost:3002/checkout/creator")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("always disables demo mode on the production site, even if allowlisted", () => {
    const context = { cf: { env: {
      CHECKOUT_DEMO_MODE: "true",
      CHECKOUT_DEMO_ALLOWED_HOSTS: "edicut.com, www.edicut.com",
    } } };
    expect(isCheckoutDemoMode(context, "https://edicut.com/checkout/creator")).toBe(false);
    expect(isCheckoutDemoMode(context, "https://www.edicut.com/checkout/creator")).toBe(false);
  });

  it("requires an exact server allowlist entry for non-local hosts", () => {
    const context = { cf: { env: {
      CHECKOUT_DEMO_MODE: "true",
      CHECKOUT_DEMO_ALLOWED_HOSTS: " preview.edicut.test, demo.example.test ",
    } } };
    expect(isCheckoutDemoMode(context, "https://preview.edicut.test/checkout/creator")).toBe(true);
    expect(isCheckoutDemoMode(context, "https://sub.preview.edicut.test/checkout/creator")).toBe(false);
    expect(isCheckoutDemoMode(context, "https://demo.example.test.attacker.invalid/checkout/creator")).toBe(false);
  });
});

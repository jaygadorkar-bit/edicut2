import { afterEach, describe, expect, it, vi } from "vitest";
import { executeInvisibleRecaptcha } from "./recaptcha.client";

function setup() {
  const input = { value: "" };
  const container = { dataset: {} };
  let callbacks: Parameters<NonNullable<Window["grecaptcha"]>["render"]>[1];
  const captcha = {
    ready: (callback: () => void) => callback(),
    render: vi.fn((_container, parameters) => { callbacks = parameters; return 12; }),
    reset: vi.fn(), execute: vi.fn(),
  };
  vi.stubGlobal("window", { grecaptcha: captcha, setTimeout, clearTimeout });
  vi.stubGlobal("document", { querySelector: () => ({ dataset: { edicutRecaptchaSiteKey: "test-key" } }) });
  const form = { querySelector: (selector: string) => selector.includes("input") ? input : container } as unknown as HTMLFormElement;
  return { input, form, captcha, complete: (token: string) => callbacks.callback(token), fail: () => callbacks["error-callback"]() };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("invisible CAPTCHA retries", () => {
  it("fails cleanly if the CAPTCHA API never becomes ready", async () => {
    vi.useFakeTimers();
    const test = setup();
    test.captcha.ready = vi.fn();

    const pending = executeInvisibleRecaptcha(test.form, "custom_quote");
    const rejection = expect(pending).rejects.toThrow("Security check is still loading");
    await vi.advanceTimersByTimeAsync(12_000);
    await rejection;
    expect(test.captcha.render).not.toHaveBeenCalled();
  });

  it("resolves each submission using the same widget with its current callback", async () => {
    const test = setup();
    const first = executeInvisibleRecaptcha(test.form, "custom_quote");
    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(1));
    test.complete("first-token"); expect(await first).toBe("first-token");
    const second = executeInvisibleRecaptcha(test.form, "custom_quote");
    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(2));
    test.complete("second-token"); expect(await second).toBe("second-token");
    expect(test.input.value).toBe("second-token"); expect(test.captcha.render).toHaveBeenCalledTimes(1);
  });
  it("clears failed tokens and lets a subsequent attempt complete", async () => {
    const test = setup();
    const failed = executeInvisibleRecaptcha(test.form, "custom_quote");
    const rejection = expect(failed).rejects.toThrow("Security check failed");
    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(1));
    test.fail(); await rejection; expect(test.input.value).toBe("");
    const retry = executeInvisibleRecaptcha(test.form, "custom_quote");
    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(2));
    test.complete("retry-token"); expect(await retry).toBe("retry-token");
  });
  it("does not start a second simultaneous challenge", async () => {
    const test = setup();
    const active = executeInvisibleRecaptcha(test.form, "custom_quote");
    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(1));
    await expect(executeInvisibleRecaptcha(test.form, "custom_quote")).rejects.toThrow("already in progress");
    test.complete("token"); await active;
  });
});

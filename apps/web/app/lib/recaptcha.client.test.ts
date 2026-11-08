import { afterEach, describe, expect, it, vi } from "vitest";
import { executeInvisibleRecaptcha, getRecaptchaSiteKey } from "./recaptcha.client";

function setup({ apiLoaded = true }: { apiLoaded?: boolean } = {}) {
  const input = { value: "" };
  const container = { dataset: {} };
  let callbacks: Parameters<NonNullable<Window["grecaptcha"]>["render"]>[1];
  const captcha = {
    ready: (callback: () => void) => callback(),
    render: vi.fn((_container, parameters) => { callbacks = parameters; return 12; }),
    reset: vi.fn(), execute: vi.fn(),
  };
  const siteKeyElement = { dataset: { edicutRecaptchaSiteKey: "test-key" } };
  const querySelector = vi.fn((selector: string) =>
    selector === "[data-edicut-recaptcha-site-key]" ? siteKeyElement : null,
  );
  const scriptListeners = new Map<string, () => void>();
  const script = {
    dataset: {} as Record<string, string>,
    addEventListener: (event: string, callback: () => void) => scriptListeners.set(event, callback),
    removeEventListener: vi.fn(),
  };
  const windowMock = {
    grecaptcha: apiLoaded ? captcha : undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  const appendChild = vi.fn(() => {
    windowMock.grecaptcha = captcha;
    scriptListeners.get("load")?.();
  });
  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("document", { querySelector, createElement: () => script, head: { appendChild } });
  const form = { querySelector: (selector: string) => selector.includes("input") ? input : container } as unknown as HTMLFormElement;
  return { input, form, captcha, querySelector, appendChild, script, complete: (token: string) => callbacks.callback(token), fail: () => callbacks["error-callback"]() };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("invisible CAPTCHA retries", () => {
  it("reads the site key from a root data attribute, without requiring an eager script", () => {
    const test = setup();
    expect(getRecaptchaSiteKey()).toBe("test-key");
    expect(test.querySelector).toHaveBeenCalledWith("[data-edicut-recaptcha-site-key]");
  });

  it("loads the CAPTCHA API only when a protected form requests a token", async () => {
    const test = setup({ apiLoaded: false });
    const pending = executeInvisibleRecaptcha(test.form, "custom_quote");

    await vi.waitFor(() => expect(test.captcha.execute).toHaveBeenCalledTimes(1));
    test.complete("lazy-token");

    expect(await pending).toBe("lazy-token");
    expect(test.appendChild).toHaveBeenCalledTimes(1);
    expect(test.script).toMatchObject({
      src: "https://www.google.com/recaptcha/api.js?render=explicit",
      async: true,
      defer: true,
    });
    expect(test.script.dataset.edicutRecaptchaSiteKey).toBe("test-key");
  });

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

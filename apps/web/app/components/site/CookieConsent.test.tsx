// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SITE_ANALYTICS_CONSENT_KEY } from "../../lib/site-analytics";
import { CookieConsent } from "./CookieConsent";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.removeItem(SITE_ANALYTICS_CONSENT_KEY);
  document.documentElement.removeAttribute("data-edicut-consent");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><CookieConsent /></MemoryRouter>));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.removeAttribute("data-edicut-consent");
});

it("renders the first-visit notice in server HTML", () => {
  const html = renderToString(<MemoryRouter><CookieConsent /></MemoryRouter>);
  expect(html).toContain('id="edicut-cookie-consent"');
  expect(html).toContain("We value your privacy");
});

it("keeps the nonmodal cookie notice in the complementary landmark, not as a dialog", () => {
  const notice = host.querySelector("aside");
  expect(notice).not.toBeNull();
  expect(notice?.getAttribute("role")).toBeNull();
  expect(notice?.getAttribute("aria-labelledby")).toBe("cookie-consent-title");
  expect(notice?.getAttribute("aria-describedby")).toBe("cookie-consent-description");
  expect(host.querySelector("#cookie-consent-title")?.textContent).toBe("We value your privacy");
  expect(host.querySelector("#cookie-consent-description")?.textContent).toContain("Optional cookies help us improve it.");
});

it("hides the notice when a valid choice was saved", async () => {
  window.localStorage.setItem(
    SITE_ANALYTICS_CONSENT_KEY,
    JSON.stringify({ analytics: false, marketing: false, savedAt: "2026-11-08T00:00:00.000Z" }),
  );

  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><CookieConsent /></MemoryRouter>));

  expect(host.querySelector("#edicut-cookie-consent")).toBeNull();
  expect(document.documentElement.dataset.edicutConsent).toBe("saved");
});

// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SITE_ANALYTICS_CONSENT_KEY } from "../../lib/site-analytics";
import { GoogleTagManager, GoogleTagManagerBootstrap } from "./GoogleTagManager";

type GoogleTagTestWindow = Window & { dataLayer?: IArguments[] };

let host: HTMLDivElement;
let root: Root;

function ConsentAwareTag() {
  const { pathname } = useLocation();
  return <><GoogleTagManagerBootstrap /><GoogleTagManager pathname={pathname} /></>;
}

function NavigableTag() {
  const { pathname } = useLocation();
  return (
    <>
      <GoogleTagManagerBootstrap />
      <GoogleTagManager pathname={pathname} />
      <Link to="/dashboard/projects/private-id?email=private@example.com">Open workspace</Link>
    </>
  );
}

function PendingNavigationTag() {
  const { pathname } = useLocation();
  const [pendingPathname, setPendingPathname] = useState<string>();
  return (
    <>
      <GoogleTagManagerBootstrap />
      <GoogleTagManager pathname={pathname} pendingPathname={pendingPathname} />
      <button type="button" onClick={() => setPendingPathname("/dashboard/projects/private-id")}>Prepare workspace navigation</button>
    </>
  );
}

function commands() {
  return ((window as GoogleTagTestWindow).dataLayer ?? []).map((entry) => Array.from(entry));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  (window as Window & { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } } })
    .happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  window.localStorage.clear();
  document.querySelectorAll("script[data-edicut-google-tag-manager], script[data-edicut-google-tag-bootstrap]")
    .forEach((script) => script.remove());
  const tagScript = document.createElement("script");
  tagScript.dataset.edicutGoogleTagManager = "true";
  document.head.appendChild(tagScript);
  Reflect.deleteProperty(window, "dataLayer");
  Reflect.deleteProperty(window, "gtag");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll("script[data-edicut-google-tag-manager], script[data-edicut-google-tag-bootstrap]")
    .forEach((script) => script.remove());
  Reflect.deleteProperty(window, "dataLayer");
  Reflect.deleteProperty(window, "gtag");
  window.localStorage.clear();
});

it("loads the Google snippet on public pages without saved consent", async () => {
  window.localStorage.setItem(SITE_ANALYTICS_CONSENT_KEY, JSON.stringify({ analytics: false, marketing: false }));
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/blog/editing-guide?email=private@example.com"]}>
      <ConsentAwareTag />
    </MemoryRouter>,
  ));

  const script = document.querySelector<HTMLScriptElement>("script[data-edicut-google-tag-manager]");
  expect(script?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-MFT59BNH");
  expect(script?.parentElement).toBe(document.head);
  expect(document.querySelectorAll("script[data-edicut-google-tag-manager]")).toHaveLength(1);
  expect(document.querySelector("script[data-edicut-google-tag-bootstrap]")?.textContent).toContain("gtag('js', new Date());");

  const queued = commands();
  expect(queued.find((entry) => entry[0] === "set")?.[1]).toEqual({ page_location: `${window.location.origin}/blog/editing-guide` });
  expect(queued.some((entry) => entry[0] === "consent")).toBe(false);
  expect(JSON.stringify(queued)).not.toContain("private@example.com");
});

it("does not load the Google container on private or maintenance routes", async () => {
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/dashboard/projects/private-id"]}>
      <ConsentAwareTag />
    </MemoryRouter>,
  ));

  expect(document.querySelector<HTMLScriptElement>("script[data-edicut-google-tag-manager]")?.hasAttribute("src")).toBe(false);
  expect((window as GoogleTagTestWindow).dataLayer).toBeUndefined();

  await act(async () => root.render(
    <MemoryRouter initialEntries={["/maintenance"]}>
      <ConsentAwareTag />
    </MemoryRouter>,
  ));

  expect(document.querySelector<HTMLScriptElement>("script[data-edicut-google-tag-manager]")?.hasAttribute("src")).toBe(false);
});

it("revokes Google consent before SPA navigation into the workspace without sending its URL", async () => {
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/"]}>
      <NavigableTag />
    </MemoryRouter>,
  ));

  expect(document.querySelectorAll("script[data-edicut-google-tag-manager]")).toHaveLength(1);
  await act(async () => host.querySelector("a")?.click());

  const script = document.querySelector<HTMLScriptElement>("script[data-edicut-google-tag-manager]");
  expect(script?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-MFT59BNH");
  expect(script?.parentElement).toBe(document.head);
  expect(document.querySelectorAll("script[data-edicut-google-tag-manager]")).toHaveLength(1);

  const queued = commands();
  const updates = queued.filter((entry) => entry[0] === "consent" && entry[1] === "update");
  expect(updates.at(-1)?.[2]).toEqual({
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  expect(JSON.stringify(queued)).not.toContain("private-id");
  expect(JSON.stringify(queued)).not.toContain("private@example.com");
});

it("revokes consent before a pending private route commits", async () => {
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/"]}>
      <PendingNavigationTag />
    </MemoryRouter>,
  ));

  await act(async () => host.querySelector("button")?.click());

  const script = document.querySelector<HTMLScriptElement>("script[data-edicut-google-tag-manager]");
  expect(script?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-MFT59BNH");
  expect(script?.parentElement).toBe(document.head);

  const queued = commands();
  const updates = queued.filter((entry) => entry[0] === "consent" && entry[1] === "update");
  expect(updates.at(-1)?.[2]).toEqual({
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  expect(JSON.stringify(queued)).not.toContain("private-id");
});

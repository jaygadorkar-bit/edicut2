// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BLOG_POSTS } from "../../lib/blog";
import { BlogRelatedSlider } from "./BlogRelatedSlider";

const posts = BLOG_POSTS.slice(1, 6);
let host: HTMLDivElement;
let root: Root;
let scroller: HTMLDivElement;
let scrollTo: ReturnType<typeof vi.fn>;

function Location() { return <output>{useLocation().pathname}</output>; }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><BlogRelatedSlider posts={posts} /><Location /></MemoryRouter>));
  scroller = host.querySelector<HTMLDivElement>('[aria-roledescription="carousel"]')!;
  Object.defineProperties(scroller, {
    clientWidth: { value: 700 }, scrollWidth: { value: 1800 }, scrollLeft: { value: 0, writable: true },
  });
  scroller.getBoundingClientRect = () => ({ left: 0, right: 700 }) as DOMRect;
  Array.from(scroller.children).forEach((slide, index) => {
    slide.getBoundingClientRect = () => ({ left: index * 360 - scroller.scrollLeft, right: index * 360 + 336 - scroller.scrollLeft }) as DOMRect;
  });
  scrollTo = vi.fn(({ left }: ScrollToOptions) => {
    scroller.scrollLeft = left ?? 0;
    scroller.dispatchEvent(new Event("scroll"));
  });
  Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });
  scroller.setPointerCapture = vi.fn();
  scroller.releasePointerCapture = vi.fn();
  scroller.hasPointerCapture = () => true;
  await act(async () => scroller.dispatchEvent(new Event("scroll")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("renders each guide once with labelled controls and no duplicate IDs", () => {
  expect(scroller.querySelectorAll("article")).toHaveLength(posts.length);
  expect(new Set(Array.from(host.querySelectorAll("[id]")).map(node => node.id)).size).toBe(host.querySelectorAll("[id]").length);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Previous guides"]')!.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Guides 1–2 of 5");
  expect(host.querySelector('[aria-label="Next guides"]')?.getAttribute("aria-controls")).toBe(scroller.id);
  expect(renderToStaticMarkup(<BlogRelatedSlider posts={[]} />)).toBe("");
});

it("browses with arrow controls and disables the next button at the real end", async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Next guides"]')!.click());
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 360, behavior: "smooth" });
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Previous guides"]')!.disabled).toBe(false);
  await act(async () => scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 1100, behavior: "smooth" });
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Next guides"]')!.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Guides 4–5 of 5");
});

it("supports keyboard navigation and reduced motion without taking keys from article links", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  await act(async () => scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 360, behavior: "instant" });
  await act(async () => scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "instant" });
  scrollTo.mockClear();
  const key = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  await act(async () => scroller.querySelector("a")!.dispatchEvent(key));
  expect(scrollTo).not.toHaveBeenCalled();
  expect(key.defaultPrevented).toBe(false);
});

it("suppresses accidental article clicks after mouse dragging, while keeping keyboard activation", async () => {
  const link = scroller.querySelector<HTMLAnchorElement>("a")!;
  const pointer = (type: string, x: number) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: 100 });
  await act(async () => {
    link.dispatchEvent(pointer("pointerdown", 400));
    scroller.dispatchEvent(pointer("pointermove", 180));
  });
  expect(scroller.scrollLeft).toBe(220);
  expect(scroller.classList.contains("is-dragging")).toBe(true);
  await act(async () => {
    scroller.dispatchEvent(pointer("pointerup", 180));
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, button: 0 }));
  });
  expect(host.querySelector("output")?.textContent).toBe("/");
  expect(scroller.classList.contains("is-dragging")).toBe(false);
  await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0, button: 0 })));
  expect(host.querySelector("output")?.textContent).toBe(`/blog/${posts[0].slug}`);
});

it("leaves touch gestures to native scrolling", async () => {
  await act(async () => {
    scroller.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, pointerType: "touch", clientX: 350 }));
    scroller.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 2, pointerType: "touch", clientX: 100 }));
  });
  expect(scroller.setPointerCapture).not.toHaveBeenCalled();
  expect(scroller.classList.contains("is-dragging")).toBe(false);
});

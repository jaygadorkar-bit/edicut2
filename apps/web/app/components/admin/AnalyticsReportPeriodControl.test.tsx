// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsReportPeriodControl } from "./AnalyticsReportPeriodControl";

let host: HTMLDivElement;
let root: Root;
const onPeriodChange = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  onPeriodChange.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("exposes the selected period and requests only a changed period", async () => {
  await act(async () => root.render(<AnalyticsReportPeriodControl period="monthly" onPeriodChange={onPeriodChange} />));
  const buttons = host.querySelectorAll("button");
  expect(buttons).toHaveLength(3);
  expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
  await act(async () => buttons[2].click());
  expect(onPeriodChange).not.toHaveBeenCalled();
  await act(async () => buttons[0].click());
  expect(onPeriodChange).toHaveBeenCalledExactlyOnceWith("daily");
  expect(buttons[0].type).toBe("button");
});

it("keeps the current selection while a new report is pending and prevents repeat requests", async () => {
  await act(async () => root.render(<AnalyticsReportPeriodControl period="daily" pendingPeriod="weekly" onPeriodChange={onPeriodChange} label="Interaction report period" />));
  expect(host.querySelector('[role="group"]')?.getAttribute("aria-busy")).toBe("true");
  expect(host.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Interaction report period");
  const buttons = host.querySelectorAll("button");
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(Array.from(buttons).every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  await act(async () => buttons[1].click());
  expect(onPeriodChange).not.toHaveBeenCalled();
});

it("preserves keyboard focus through pending and completed report changes", async () => {
  await act(async () => root.render(<AnalyticsReportPeriodControl period="daily" onPeriodChange={onPeriodChange} />));
  const weekly = host.querySelectorAll("button")[1];
  weekly.focus();
  await act(async () => root.render(<AnalyticsReportPeriodControl period="daily" pendingPeriod="weekly" onPeriodChange={onPeriodChange} />));
  expect(document.activeElement).toBe(weekly);
  await act(async () => root.render(<AnalyticsReportPeriodControl period="weekly" onPeriodChange={onPeriodChange} />));
  expect(document.activeElement).toBe(weekly);
  expect(weekly.getAttribute("aria-pressed")).toBe("true");
});

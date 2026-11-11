import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import VideoEditorPartnerPage from "./video-editor-partner";

function renderPartnerApplication() {
  const router = createMemoryRouter(
    [{ path: "/video-editor-partner", element: <VideoEditorPartnerPage /> }],
    { initialEntries: ["/video-editor-partner"] },
  );
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("video editor partner application steps", () => {
  it("starts with a four-step progress indicator and only the first section visible", () => {
    const html = renderPartnerApplication();
    const sections = [...html.matchAll(/<section class="partner-form-section"[^>]*>/g)].map((match) => match[0]);

    expect(sections).toHaveLength(4);
    expect(sections[0]).not.toContain("hidden=");
    expect(sections.slice(1).every((section) => section.includes('hidden=""'))).toBe(true);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuetext="Step 1 of 4: Your details"');
    expect(html).toContain("Next");
    expect(html).not.toContain("Send my application");
    expect(html.match(/<form\b[^>]*>/)?.[0]).toContain('noValidate=""');
  });

  it("labels the contact number as WhatsApp and keeps it beside the address", () => {
    const html = renderPartnerApplication();
    const phoneField = html.match(/<label class="partner-field[^\"]*" for="phone">[\s\S]*?<\/label>/)?.[0];
    const addressField = html.match(/<label class="partner-field[^\"]*" for="address">[\s\S]*?<\/label>/)?.[0];

    expect(phoneField).toContain("WhatsApp number");
    expect(phoneField).toContain("including your country code");
    expect(addressField).toContain("Address");
    expect(addressField).not.toContain("partner-field--wide");
    expect(html.indexOf('for="phone"')).toBeLessThan(html.indexOf('for="address"'));
  });
});

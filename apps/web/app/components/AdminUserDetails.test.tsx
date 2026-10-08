import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminUserDetails, type AdminUserDetailsProps } from "./AdminUserDetails";

const user: AdminUserDetailsProps["user"] = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alex Morgan", email: "alex@example.test", phone: null,
  country: null, profileImageUrl: null, role: "customer", active: true, deletedAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-08T00:00:00Z"),
};
function render(props: Partial<AdminUserDetailsProps> = {}) {
  const router = createMemoryRouter([{ path: "/", element: <AdminUserDetails user={user} returnTo="/site/node-logmin?tab=users&page=2" canEdit {...props} /> }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("admin account details", () => {
  it("keeps all profile fields together in a multipart form and isolates other action intents", () => {
    const html = render();
    const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
    const profile = forms.find(form => form.includes('value="save-profile"'))!;
    expect(profile).toContain('encType="multipart/form-data"');
    for (const name of ["name", "email", "phone", "country", "profileImageUrl", "profileImageFile", "role", "active"]) expect(profile).toContain(`name="${name}"`);
    expect(profile).not.toContain('name="password"');
    expect(forms.filter(form => form.includes('value="reset-password"'))).toHaveLength(1);
    expect(forms.filter(form => form.includes('value="reset-creator-profile"'))).toHaveLength(1);
    expect(forms.filter(form => form.includes('value="move-to-trash"'))).toHaveLength(1);
    expect(html).not.toContain("restart_alt");
    expect(html).toContain('href="/site/node-logmin?tab=users&amp;page=2"');
  });
  it.each([{ canEdit: false }, { busy: true }])("disables editable fieldsets and all submit actions when %j", state => {
    const html = render(state);
    expect([...html.matchAll(/<fieldset\b[^>]*>/g)].every(match => match[0].includes("disabled"))).toBe(true);
    expect([...html.matchAll(/<button\b[^>]*>/g)].every(match => match[0].includes("disabled"))).toBe(true);
  });
  it("shows restore and permanent deletion only for a trashed account", () => {
    const active = render();
    expect(active).not.toContain('value="permanent-delete"');
    const trashed = render({ user: { ...user, deletedAt: new Date("2026-10-08T00:00:00Z") } });
    expect(trashed).toContain("In trash");
    expect(trashed).toContain('value="restore"');
    expect(trashed).toContain('value="permanent-delete"');
    expect(trashed).not.toContain('value="move-to-trash"');
  });
  it("uses labeled required password fields, stable UTC dates, and accessible action feedback", () => {
    const html = render({ result: { error: "Password mismatch." } });
    expect(html).toContain('role="alert">Password mismatch.</p>');
    expect(html).toContain("New password");
    expect(html).toContain("Confirm new password");
    const password = html.match(/<input\b[^>]*name="password"[^>]*>/)?.[0];
    expect(password).toContain('type="password"');
    expect(password).toContain('required=""');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('dateTime="2026-10-01T00:00:00.000Z">Oct 1, 2026</time>');
  });
  it("edits admin identities without client-only fields or deletion actions", () => {
    const html = render({ user: { ...user, role: "admin" }, adminAccount: { self: false } });
    expect(html).toContain("Admin account details");
    expect(html).toContain("Administrator access");
    expect(html).not.toContain('name="country"');
    expect(html).not.toContain('name="profileImageFile"');
    expect(html).not.toContain('name="role"');
    expect(html).not.toContain('value="move-to-trash"');
    expect(html).not.toContain('value="reset-creator-profile"');
    expect(html.match(/<input\b[^>]*name="password"[^>]*>/)?.[0]).toContain('minLength="12"');
  });
  it("requires the own-account password flow and prevents self-disable", () => {
    const html = render({ adminAccount: { self: true } });
    expect(html).toContain('href="/site/node-logmin/account"');
    expect(html).not.toContain('value="reset-password"');
    expect(html.match(/<input\b[^>]*type="checkbox"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain('type="hidden" name="active" value="on"');
  });
});

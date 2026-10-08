import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminUsersTable } from "./admin";

it("links every admin cell to the same editor with one keyboard stop and the directory filters retained", () => {
  const admin = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Admin", email: "admin@example.test", role: "admin", active: true, createdAt: new Date(), updatedAt: new Date() };
  const params = new URLSearchParams("tab=users&view=admins&q=Admin&page=2");
  const router = createMemoryRouter([{ path: "/", element: <AdminUsersTable adminUsers={[admin]} searchParams={params} /> }]);
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  const row = html.split("<tbody")[1];
  const links = [...row.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
  expect(links).toHaveLength(4);
  for (const link of links) {
    expect(link).toContain('/site/node-logmin/admins/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?returnTo=%2Fsite%2Fnode-logmin%3Ftab%3Dusers%26view%3Dadmins%26q%3DAdmin%26page%3D2');
    expect(link).toContain("after:absolute after:inset-0");
  }
  expect(links.filter(link => !link.includes('tabindex="-1"'))).toHaveLength(1);
  expect(row).toContain('aria-label="Edit Admin&#x27;s admin account"');
});

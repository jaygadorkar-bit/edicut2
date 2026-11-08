import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AdminToolbar } from "./AdminToolbar";
import { AdminPanelShell } from "../AdminPanelShell";

const state = vi.hoisted(() => ({ collapsed: false }));
vi.mock("../WorkspaceServices", () => ({ useWorkspaceNavigationState: () => [state.collapsed, () => {}] }));

function preview(workspace = true, collapsed = false) {
  state.collapsed = collapsed;
  const router = createMemoryRouter([{ id: "root", path: "/", element: <div className="neo-app-shell neo-app-shell--admin-toolbar">
    <AdminToolbar />
    {workspace ? <AdminPanelShell title="Clients" activeTab="clients" account={{ name: "Layout preview", detail: "Sample workspace" }} headerActions={<button type="button" className="neo-workspace__icon-button" aria-label="Role manager"><span className="material-symbols-outlined" aria-hidden="true">manage_accounts</span></button>}>
      <h2>Workspace alignment preview</h2><p className="mt-2 mb-6 text-sm text-slate-600">Shared toolbar, sidebar, header, and content frame. This preview contains sample content.</p>
      <div className="grid gap-4 sm:grid-cols-2"><section className="neo-workspace__panel rounded-2xl p-6"><h3>Client directory</h3><p className="mt-3 text-sm text-slate-600">Toolbar actions follow the workspace frame at each screen width.</p></section><section className="neo-workspace__panel rounded-2xl p-6"><h3>Client workflow</h3><p className="mt-3 text-sm text-slate-600">The sign-out action aligns with the right edge of this content and the header controls.</p></section></div>
    </AdminPanelShell> : <main style={{ maxWidth: "80rem", margin: "auto", paddingTop: "2rem" }}><h1>Marketing alignment preview</h1></main>}
  </div> }]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("toolbar and workspace frame", () => {
  it("uses one frame for workspace content and header", () => {
    const html = preview();
    expect(html).toContain('neo-workspace__header-inner neo-workspace__frame');
    expect(html).toContain('neo-workspace__content neo-workspace__frame');
    expect(html).toContain('data-sidebar-collapsed="false"');
    expect(html).not.toContain('max-w-[1500px]');
  });
  it("exposes collapsed navigation state for toolbar alignment", () => {
    const html = preview(true, true);
    expect(html).toContain('data-sidebar-collapsed="true"');
    expect(html).toContain('w-[78px]');
    expect(html).toContain('lg:pl-[78px]');
  });
  it("keeps the public toolbar separate from workspace layout", () => {
    const html = preview(false);
    expect(html).toContain('neo-admin-toolbar__inner');
    expect(html).not.toContain('data-sidebar-collapsed');
    const css = readFileSync(resolve('apps/web/app/styles/global.css'), 'utf8');
    expect(css).toMatch(/\.neo-admin-toolbar__inner\s*\{[^}]*max-width: 80rem/);
    expect(css).toContain('.neo-app-shell:has(.neo-workspace) .neo-admin-toolbar__inner');
    expect(css).toContain('--neo-workspace-frame-max: 1500px');
  });
});

// Optional isolated visual fixtures use real components and compiled CSS, without auth or data access.
afterAll(() => {
  if (process.env.EDICUT_TOOLBAR_LAYOUT_PREVIEW !== '1') return;
  const output = resolve('apps/web/public/__toolbar-layout-review');
  mkdirSync(output, { recursive: true });
  const assets = resolve('apps/web/build/client/assets');
  const css = readdirSync(assets).find(file => /^global-.*\.css$/.test(file));
  if (!css) throw new Error('Build the application before generating the visual fixtures.');
  copyFileSync(resolve(assets, css), resolve(output, 'layout.css'));
  for (const [name, workspace, collapsed] of [['expanded', true, false], ['collapsed', true, true], ['marketing', false, false]] as const) {
    writeFileSync(resolve(output, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Toolbar layout review</title><link rel="stylesheet" href="./layout.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"></head><body class="antialiased">${preview(workspace, collapsed)}</body></html>`);
  }
});

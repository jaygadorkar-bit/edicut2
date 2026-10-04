# Frontend architecture

`apps/web` is the customer-facing site and workspace application. It uses React Router 7 route modules, Vite, Tailwind CSS, server rendering, and a Cloudflare Worker runtime. The route table lives in `app/routes.ts`; the Worker and static asset binding are configured in `workers/app.ts` and `wrangler.jsonc`.

## Where code belongs

| Path | Responsibility |
| --- | --- |
| `app/routes/` | Route loaders, actions, metadata, and route-level UI. Keep request-specific data access in loaders/actions. |
| `app/components/home/` | Homepage sections and homepage-specific composition. |
| `app/components/site/` | Shared public-site layout, marketing sections, support widgets, and motion. |
| `app/components/auth/` | Reusable authentication UI. |
| `app/components/admin/` | Admin-only interface components. |
| `app/components/WorkspaceShell.tsx` and `WorkspaceWidgets.tsx` | Shared customer/admin workspace navigation and dashboard widgets. |
| `app/lib/` | Pure helpers and server-side integrations. Keep browser-safe helpers separate from modules that access secrets, sessions, databases, or provider APIs. |
| `app/integrations/` | External service clients and runtime adapters. |
| `app/styles/global.css` | Global theme tokens and Tailwind entry point. It imports `typography.css` and `home-mobile.css`. |
| `public/` | Static files served from `apps/web/public/`, including icons and fonts. |

The filename `routes/dashboard-placeholder.tsx` is historical: the `dashboard/:section` route now implements customer projects, reviews, uploads, billing, affiliate requests, and settings. The route pattern and mapping are in `app/routes.ts`.

## Route and data flow

`app/root.tsx` owns the document shell, global loader data, shared stylesheet/font links, error boundary, and site-wide effects. Route modules use React Router `loader` functions for reads and `action` functions for writes; their components consume the returned data with `useLoaderData` and action state with `useActionData`. `workers/app.ts` applies the Content Security Policy, security headers, and cache policy for static assets; add external frame/media origins there only when a feature actually needs them. Prefer React Router forms/fetchers over putting request logic in effects.

The route table groups public pages, authentication, customer workspace, and operations pages. The operations UI uses one route with a `?tab=` query, while its route loader selects data according to the active tab. Keep those requirements centralized in `app/lib/admin-data-requirements.ts`; `admin-data-requirements.test.ts` guards the query plan. Customer dashboard loaders scope every workspace query to the signed-in owner; the overview fetches only its five recent projects and computes counts in the database.

Files ending in `.server.ts` contain server-only integrations, such as database access, sessions, OAuth, Cloudinary administration, and site settings. Do not import them into browser-only components or return secret values from route loaders. `@edicut/shared` holds contracts shared with other apps; `@edicut/db` owns Drizzle schema/repositories; `@edicut/platform-core` holds cross-platform logic.

## Styling and interaction

Use Tailwind utilities for local layout and the existing CSS variables/classes for shared EdiCut surfaces. Theme and neomorphic tokens are defined near the top of `app/styles/global.css`. Keep responsive rules close to the component’s existing stylesheet (`home-mobile.css` for homepage-only mobile behavior) and avoid adding a second design-token system.

`app/lib/site-motion.ts` defines which paths mount Lenis scrolling and the page-transition click handler. Public site pages keep those effects; dashboards, admin, checkout, and authentication routes use native navigation and scrolling. Add tests when changing route groups so workspace navigation stays immediate.

## Performance conventions

- Fetch only the data needed by the current route or tab. Use `Promise.all` for independent required reads; skip unrelated provider calls rather than awaiting them and discarding the result.
- Paginate administrative lists and cap provider inventory queries. Clamp caller-supplied page numbers to the actual page range before applying an offset. Keep loader responses free of unused collections and secrets.
- Mark below-the-fold images and repeated workspace avatars `loading="lazy"` and `decoding="async"`; give media intrinsic dimensions or an aspect-ratio container to limit layout shift. Keep eager loading for actual above-the-fold imagery only.
- Use `preload="none"` for video lists where users opt into playback. Avoid loading video embeds before interaction.
- Respect `prefers-reduced-motion`. Avoid starting animation loops or document-wide event handlers on workspace/auth routes.
- Keep `app/lib/material-symbols.ts` in sync with every Material Symbols ligature used in JSX or icon data. The root stylesheet link requests only that sorted icon set; its unit test protects the Google Fonts URL contract.
- Compare the production Vite gzip report before adding dependencies or moving code into the shared root bundle. Route modules are split by React Router; changes to shared components can affect every page.

## Development and verification

From the repository root:

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm audit --prod
```

`pnpm dev` and the Docker web profile serve EdiCut at `http://localhost:3002` to avoid conflicts with other local apps. Docker bind-mounts the repository and reads local runtime configuration from `.env.cloudflare`. Local Google OAuth redirects to `http://localhost:3002/api/auth/callback/google`; register that URI with the OAuth client. Keep `.env.cloudflare` and other local environment files private.

## Telegram order notifications

The checkout and project actions send an order summary after saving an unpaid subscription request or new project request. It includes the order ID, plan/project title, amount or estimate, and status, but no customer phone number or email. Telegram delivery runs in the Worker background and does not block the customer action.

Create a bot with `@BotFather`, open its private chat and send `/start` (or add it to the destination group), then configure these secrets for the production Worker. Wrangler prompts for each value; do not paste the bot token into source files or chat:

```powershell
pnpm --filter @edicut/web exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm --filter @edicut/web exec wrangler secret put TELEGRAM_CHAT_ID
```

Use the bot's private or group chat ID; a public channel username such as `@edicut_orders` is also accepted. For local development, set the same names in an ignored local environment file. Notifications remain disabled until both values are set.

Vitest is configured at the repository root in `vitest.config.ts`; tests live beside the pure helpers they cover and use `*.test.ts` or `*.spec.ts`. `pnpm typecheck` checks the shared, database, web, and Node API packages. `pnpm build` builds all deployable apps; use `pnpm --filter @edicut/web build` when validating a frontend-only change.

Linting is not configured as a supported check yet: there is no `lint` package script, and the current flat ESLint config only excludes generated folders. Add a TypeScript parser/rule set and a workspace script before treating ESLint as part of the verification workflow.

The root `package.json` keeps scoped pnpm overrides for patched transitive versions of Babel 7, brace expansion, Browserslist, js-yaml, and Valibot. Re-run `pnpm audit` when changing those overrides. On 2026-10-01, `pnpm audit --prod` reported no advisories and the full workspace audit reported no high or critical advisories; one moderate advisory remains in the deprecated Drizzle Kit config-loader chain (`@esbuild-kit/esm-loader` → esbuild 0.18). It is not included in the production dependency graph. Avoid forcing a cross-major esbuild override there without testing Drizzle Kit configuration loading.

Dependency compatibility notes from the same build: Wrangler 4.146 requires `@cloudflare/workers-types` 5.x, while `@react-router/cloudflare` 7.18.4 declares a 4.x peer range. The web app's `pnpm typecheck` and production build pass with workers types 5.20261001.1, but pnpm reports the peer mismatch; revisit it when the adapter updates its range. React Router also prints its v8 future-flag migration notices during builds. Evaluate those flags with route behavior tests before enabling them.

For UI changes, verify public desktop and mobile layouts as well as customer/admin workspace navigation at a narrow viewport. For loader changes, verify unauthenticated redirects and the affected tab’s data after both typecheck and build. Do not run database migrations or deploy as part of a local frontend validation task.

## Current optimization notes

The admin loader now avoids user metrics/list queries outside overview/users, package data outside overview/packages, role/settings data outside their tabs, and Cloudinary inventory/usage outside media tabs; its overview sends scalar package/media counts instead of the inventory data. Admin user metrics use one filtered aggregate over the users table plus one count for active admin accounts. The project workspace is paginated to 20 records and selects only fields shown on the current page; it fetches and groups shared-file links for those projects once, instead of loading all projects/files and rescanning every link for each project. The customer overview fetches five recent projects and computes project/file counts in SQL; the projects, reviews, uploads, and billing views load only the records they render. Admin and package image galleries decode lazily, workspace avatars load on demand, and portfolio videos wait for playback. The site-motion gate prevents Lenis animation frames and the global page-transition click handler from running in account/workspace flows. Lenis itself is dynamically imported only when site motion mounts. The root batches its required site settings, skips root settings reads entirely for OAuth/resource endpoints, and skips promo-bar reads on account, workspace, admin, and infrastructure routes. The admin settings tab fetches its settings in one query. Independent sessions are parsed in parallel, and legacy sign-in URLs redirect before session/settings work.

The 2026-10-01 local production build reports the shared root chunk at 4.70 KB gzip and the optional Lenis chunk at 5.74 KB gzip. Before the dynamic import, root was 8.84 KB gzip. Workspace/auth/checkout pages now avoid the Lenis request; public motion pages request it on demand. The current marketing route chunk is 19.75 KB gzip, the admin route is 18.20 KB gzip, and the global CSS is 25.25 KB gzip. Treat these as a snapshot, not enforced limits; compare Vite's gzip report after dependency or shared-shell changes.

The Material Symbols font is subset to the 112 ligatures currently used in the application. A Chrome 131 Google Fonts request check on 2026-10-01 returned a 36,072-byte WOFF2 subset versus 1,137,516 bytes for the unsubset font request (about 97% smaller). The result depends on browser, cache, and Google Fonts responses; use it as a comparison snapshot, not a guaranteed transfer size.

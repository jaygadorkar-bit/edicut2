# EdiCut SEO implementation

Updated 20 October 2026.

## Technical visibility

- On 20 October 2026, search crawling was enabled in the production `site_settings` record while maintenance mode was off. The settings reader defaults to crawling enabled and maintenance disabled if it cannot read the flags, so these settings are not a fail-closed crawler switch.
- Cloudflare's `edicut.com` zone has Always Use HTTPS enabled. HTTP requests for the apex and `www` hosts now return 301 to the matching HTTPS URL; both HTTPS hosts return HTTP 200.
- `/robots.txt` allows public crawling on the production domain and points to `/sitemap.xml`. Non-production hosts remain blocked.
- `/sitemap.xml` is generated from the shared public-page registry and the active pricing catalog. The registry also drives static prerendering and the indexable-page allowlist, including `/why-hire-us` and the service pages.
- Error responses and private application routes remain `noindex`.
- The site is registered in Google Search Console as the domain property `edicut.com`, owned by `edicutstudio@gmail.com`. Ownership was verified through Cloudflare DNS. Keep the `google-site-verification` TXT record at the zone apex to retain verification.

## Pages and on-page signals

- Added `/services` and five focused pages: YouTube video editing, podcast video editing, short-form editing, gaming editing, and YouTube thumbnail design.
- `/services/youtube-video-editing` is the primary page for people looking to hire a YouTube editor. Its title, heading, and visible answers now distinguish EdiCut's done-for-you service from editing software and help buyers compare package scope and editor fit.
- Public routes have distinct titles and descriptions, canonical URLs, Open Graph and Twitter metadata, and the shared 1200 × 630 social preview image.
- Organization and WebSite structured data are included on indexable pages. Service and breadcrumb structured data are included on service pages.
- Service pages link to relevant packages, portfolio examples, contact, and related services.
- Unverified homepage ratings, volume claims, testimonials, and logo endorsements were removed. Public YouTube sample videos are labeled as references when their saved record identifies them as samples.

## Performance and measurement

- Homepage videos load only after a visitor chooses to play them. Images expose dimensions to reduce layout shift, and mobile navigation does not leave hidden links keyboard-accessible.
- Consent-based first-party analytics groups visits by a fixed source category and safe public landing path. It does not store raw referrers, campaign values, quote IDs, form fields, or transaction IDs.
- The live `robots.txt` permits public crawlers. Requests to the YouTube service page with OAI-SearchBot, Claude-SearchBot, Claude-User, Googlebot, and Bingbot user-agent strings returned 200 on 20 October 2026. This confirms the public route is not blocked by a basic user-agent rule; it does not prove that a provider has indexed or cited the page.
- The current wildcard rule also permits provider training/grounding crawlers (including GPTBot, ClaudeBot, and Google's Google-Extended control token). Search/retrieval and training controls are separate for these providers; no training-specific opt-out is configured.
- Contact inquiries and quote requests are counted after the application confirms the server-side save. `/custom-quote` and checkout pages do not produce page-view counts. Checkout selections are counted; a browser return is not treated as a confirmed payment because the signed Cryptomus webhook is the settlement authority.
- The acquisition migration was applied to production Supabase project `uebqtbydqkdpicdskoej` on 20 October 2026. The daily acquisition table is server-written, has row-level security enabled, and grants no table access to `anon` or `authenticated` roles.

## Ongoing work

1. The sitemap was submitted in Search Console on 20 October 2026 and contained 20 URLs at submission time; the total can change as active pricing packages change. The report initially showed “Couldn't fetch” with zero discovered pages. After the deployment and successful live URL inspections, the report refreshed to “Success” with 20 discovered pages and a last-read date of 20 October. Do not resubmit unless the status changes.
2. The homepage's stored inspection result reflected a 19 October crawl blocked by the old `robots.txt`. After deployment, live URL tests for the homepage, `/services`, and all five service pages reported “URL is available to Google” and “Page can be indexed,” except the gaming page's explicit live test briefly returned a generic error. Its subsequent request-indexing flow succeeded. Search Console accepted priority crawl requests for the homepage, `/services`, and all five service pages. Review the Pages report over the following weeks. Google controls crawl and indexing timing; these requests do not guarantee inclusion or rankings.
3. Search Console's HTTPS report listed `https://edicut.com/` from a 14 October crawl as not served over HTTPS. Cloudflare's redirect is now enabled and verified live; validation was started in Search Console on 20 October. Check the report again when validation finishes.
4. Replace or confirm the configured portfolio entries with real EdiCut work, verified channel attribution, client permission, and accurate results. Code cannot verify who produced a saved portfolio video.
5. Add future service pages only when EdiCut has enough distinct process detail and examples to make each page useful. Do not publish invented client outcomes, turnaround guarantees, or location claims.
6. Review the consented source and inquiry totals in the admin analytics view alongside Search Console impressions and clicks. Manual Actions and Security Issues currently report no issues.
7. Add permissioned case studies of work EdiCut actually produced, with creator attribution, scope, samples, and measured outcomes only when verified. The portfolio currently labels external videos as references; do not present them as EdiCut client results.
8. Connect the domain to Bing Webmaster Tools and review its AI Performance report when available. For Google AI Search, continue standard SEO and first-hand helpful content; Google's current guidance says `llms.txt` and special AI schema do not improve Google visibility. See https://developers.google.com/search/docs/fundamentals/ai-optimization-guide.

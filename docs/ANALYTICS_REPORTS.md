# Admin on-site report periods

The admin analytics page supports `?period=daily`, `?period=weekly`, and
`?period=monthly`. Missing or invalid values default to monthly. The selection
survives refreshes, browser back/forward navigation, and the automatic refresh.

| Selection | Included UTC dates |
| --- | --- |
| Daily | Today |
| Weekly | Today and the preceding six dates |
| Monthly | Today and the preceding 29 dates |

These are rolling windows including the partial current day, rather than calendar
week/month buckets. Each panel displays the exact range in UTC, matching the
timezone used when collecting daily aggregates.

The shared selection updates likely human browser-tab session estimates, search
traffic and lead signals, and interaction-area totals. Controls appear above the
dashboard and in the interaction report. Cloudflare's traffic pulse, bot activity,
and security panels retain their explicitly labeled provider windows. Its country
report has its own period selector and uses the latest available provider dates.

## Query and UI behavior

- The loader authorizes an administrator before querying reports. Existing
  no-store/noindex headers remain in place.
- A single allowlisted range is calculated per loader request. All three on-site
  reads use bound start-inclusive/end-exclusive date parameters, including an upper
  bound that excludes future dates. No arbitrary date span can be requested.
- Existing day indexes/primary keys serve the range predicates. Interaction and
  acquisition result caps remain 200 and 500 groups respectively.
- Missing session days are filled with zeros. The session summary totals the
  selected window; it is a consented tab-session estimate, not unique people.
- The route commits the range and its on-site totals together. While navigating,
  controls show busy status and keep the previous selection until matching data
  arrives. Buttons are keyboard accessible and at least 44px high.
- Automatic refresh waits while a navigation or another revalidation is active.
- Empty reports mean no data in the selected window; they do not imply that no
  historical data exists.

No schema, tracking-consent, identifier collection, or database permission changes
are required for this feature.

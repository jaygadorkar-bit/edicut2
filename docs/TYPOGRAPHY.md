# EdiCut typography preferences

Collected on 1 October 2026 from [Alphabet's The Bureau case study](https://madebyalphabet.com/thebureau) and its [live stylesheet](https://madebyalphabet.com/dist/css/app.css?v=5df0a6786071b354ff736d82e605d15e09cc64b6).

## Reference inventory

The live webpage uses **Circular Std** throughout its HTML text. Its CSS loads CircularStd-Book at weight 400 and CircularStd-Bold at weight 600; the bold text utilities request weight 700, which the browser renders using the available bold face. No separate italic or serif face is declared for the webpage. The typography printed inside the Bureau brand images is artwork, not a live HTML font setting.

Measured viewports: desktop 1517 × 884, tablet 768 × 1024, mobile 390 × 844. Measurements were taken after responsive font transitions settled. Raw readings and CSS classes are saved in `typography-reference.json`.

| Reference role | Desktop | Tablet | Mobile | Requested weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- | --- | --- |
| Main page heading | 72px | 36px | 30px | 700 | 1 | −0.01em |
| Main menu links | 72px | 48px | 36px | 700 | 1 | −0.01em |
| Featured project menu names | 72px | 48px | 36px | 700 | 1.25 | −0.01em |
| Body copy | 20px | 18px | 18px | 400 | 1.25 | −0.01em |
| Section labels / strong copy | 20px | 18px | 18px | 700 | 1.25 | −0.01em |
| Project descriptions | 20px | 18px | 18px | 400 | 1.25 | −0.01em |
| Project links / calls to action | 20px | 18px | 18px | 700 | 1.25 | −0.01em |
| Footer details | 20px | 18px | 18px | 400 or 700 | 1.25 | −0.01em |
| Footer email field | 20px | 18px | 18px | 400 | 1.25 | normal |
| Related Projects label | 20px | 18px | 18px | 700 | 1.25 | normal |

The reference switches at 640px and 1024px. It keeps text in sentence/title case and uses one family with regular/bold contrast.

## EdiCut preferences

The chosen replacement is **DM Sans**, approved in this conversation. It has a similar geometric character and is distributed under the [SIL Open Font License](https://github.com/googlefonts/dm-fonts). The local font files include normal and italic variable fonts, Latin and extended Latin glyphs, with weights 100–1000. The license is included in `apps/web/public/fonts/OFL-DM-Sans.txt`.

The page-heading, body, menu, and tracking settings follow the reference. Section headings, card headings, prices, compact controls, and application text have separate shared roles sized for EdiCut's cards and forms.

The homepage has phone-only overrides in `apps/web/app/styles/home-mobile.css`: its hero scales from 32–38px, section headings from 26–30px, and body/controls use 16px below 640px. Font families and weights still inherit the global system below. Other pages and desktop retain the role sizes in this inventory.

| EdiCut role | Desktop ≥1024px | Tablet 640–1023px | Mobile <640px | Weight | Line height | Global size token / class |
| --- | --- | --- | --- | --- | --- | --- |
| Hero / page heading | 72px | 36px | 30px | 700 | 1 | `--type-size-display` / `yt-display`, `neo-hero-title` |
| Section heading | 48px | 36px | 30px | 700 | 1.1 | `--type-size-title` / `yt-title` |
| Card / footer heading | 28px | 24px | 24px | 700 | 1.1 | `--type-size-card-title` / `type-card-title` |
| Mobile menu links | 72px* | 48px | 36px | 700 | 1 | `--type-size-menu` / `type-menu` |
| Body / subtitle | 20px | 18px | 18px | 400 | 1.25 | `--type-size-body` / `yt-body`, `yt-subtitle` |
| FAQ question | 20px | 18px | 18px | 700 | 1.25 | `--type-size-body` / `type-question` |
| Secondary copy | 16px | 14px | 14px | 400 | 1.5 | `--type-size-small` / `yt-small` |
| Buttons / tabs / header links | 16px | 14px | 14px | 700 | 1.25 | `--type-size-control` / `type-control` |
| Prices / package total | 40px | 32px | 32px | 700 | 1 | `--type-size-price` / `type-price` |
| Eyebrows / badges | 12px | 12px | 12px | 700 | 1.25 | `--type-size-tag` / `yt-tag` |
| Default application text | 16px | 16px | 16px | 400 | 1.5 | `--type-size-ui` |
| Compact label | 12px | 12px | 12px | 400–700 | inherited | `--type-size-label` |
| Caption | 11px | 11px | 11px | inherited | inherited | `--type-size-caption` |
| Micro text / avatar initial | 10px | 10px | 10px | inherited | inherited | `--type-size-micro` |
| Small avatar initial | 8px | 8px | 8px | inherited | inherited | `--type-size-tiny` |
| Application heading | 20–28px, fluid | 20–28px, fluid | 20–28px, fluid | 700 | 1.1 | `--type-size-ui-heading` |
| Application panel title | 24–32px, fluid | 24–32px, fluid | 24–32px, fluid | 700 | 1.1 | `--type-size-ui-title` |
| Application metrics | 30px | 30px | 30px | 700 | 1 | `--type-size-ui-number` |

*The menu drawer is visible below 1024px; desktop uses compact header links.

Headings, body text, and controls use −0.01em tracking. EdiCut's uppercase badges use 0.05em. Dense UI text can use the shared medium weight 500. Strong, semibold, bold, extra-bold, and legacy black utilities all resolve to the shared strong weight 700.

## Change a font globally

Edit **`apps/web/app/styles/typography.css`**. All font preferences live there.

```css
:root {
  --font-family-base: "DM Sans", Arial, Helvetica, sans-serif;
  --font-family-heading: var(--font-family-base);
  --font-family-body: var(--font-family-base);
  --font-family-control: var(--font-family-body);
}
```

- Change `--font-family-base` to update the entire text system.
- Change `--font-family-heading` to update headings, card titles, FAQ questions, menu links, and prices together.
- Change `--font-family-body` to update paragraphs and secondary text. Controls follow this family by default.
- Change `--font-family-control` to update buttons, compact navigation, tabs, labels, and inputs independently.
- Change a `--type-size-*`, `--type-weight-*`, `--type-leading-*`, or `--type-tracking-*` token to update all matching roles. Desktop/tablet overrides are in the same file.

When introducing a new font, register its files with `@font-face` in the same stylesheet and update the preload in `root.tsx` to match its normal primary font file. Fonts use `font-display: swap` and are hosted locally. Icon fonts, code text, and logo artwork are separate roles.

The existing `yt-*` classes remain compatible with the shared settings. Tailwind family, size, and weight utilities also reference these tokens. Prefer the semantic roles above for new marketing text, rather than hardcoding sizes or families in individual components.

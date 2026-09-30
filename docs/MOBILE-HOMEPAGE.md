# Mobile homepage review

Reviewed and updated on 1 October 2026 at 320 × 740, 390 × 844, and 430 × 932. Desktop comparison: 1234 × 884.

## Findings and changes

| Finding | Implemented change |
| --- | --- |
| Hero spacing was loose, metric labels were crowded, and staggered text briefly left the headline incomplete. | Natural headline wrapping, tighter spacing, balanced metric labels, and immediate headline display. |
| Separate 3/4/3 creator rows left empty cells on phones, with small descriptions. | One continuous two-column grid; compact icon-and-text rows below 360px; 14px descriptions. |
| Pricing cards repeated generous desktop spacing. | Reduced gaps and price-block padding, removed fixed description minimum height, and tightened feature rows. |
| Portfolio filters occupied three rows and long card titles were difficult to read. | One horizontally scrollable filter row; corrected indicator position when scrolled; consistent card widths and two-line titles. |
| Benefit cards were unnecessarily tall. | Icon beside the heading and description, with compact card padding. |
| FAQ/contact cards had narrow reading space and excess padding. | Smaller card padding, 16px text with comfortable line height, 48px contact inputs, and 16px field text to avoid phone zoom. |
| Footer signup controls squeezed onto one row. | Full-width stacked controls; 44px footer link/button targets; collapsed links hidden from keyboard focus. |
| The floating support launcher covered content on phones. | Moved phone support into an expandable hamburger-menu card and kept the desktop support widget unchanged. |
| Secondary text contrast was approximately 4.0–4.2:1 on pale surfaces. | Phone-only secondary color `#5b6875`, approximately 4.8–5.1:1 on the shared backgrounds. |
| Hero label and trust marks took extra room on narrow screens; metrics displaced the headline and calls to action. | Shortened the phone hero label, hid the three metrics below 640px, and reused the portfolio/review infinite scroller for the phone-only logo ticker. Desktop hero wording and static logo row remain intact. |
| Pricing intro sat flush left, and contact guidance/form appeared as separate cards with repeated copy. | Centered the phone pricing label and title; combined contact guidance and fields into one compact card with shorter phone-only copy. |
| Footer signup copy was left aligned on phones. | Centered the footer lead copy and kept the signup controls full width. |
| Hero and pricing labels could be more direct; the portfolio had no onward action on phones. | Changed the phone hero label to “Video Editing Service,” shortened the phone pricing title, and added a phone-only “View more” portfolio link. Desktop copy and layout stay the same. |
| The contact panel repeated its heading and description on a small screen, with an email response note wrapping. | Hid the repeated title/description on phones, centered the contact label, and reduced the response note to a single small line. |
| Footer eyebrow added noise and the email placeholder was off-center. | Hid the eyebrow and centered the email input text/placeholder on phones. |
| Phone copy and actions needed a final pass at 319px. | Changed the phone eyebrow to “Video Editing Service,” shortened pricing to “Simple editing plans,” and added a centered “View more” link after the portfolio carousel. |
| The contact card repeated its title and pitch, and the reply-time line wrapped. | Removed the title and pitch on phones, centered the contact eyebrow, and fit the reply-time line at 9px. |
| The footer eyebrow took space above its title. | Hid it on phones, removed the resulting title gap, and centered footer input text and placeholder. |
| Mobile navigation did not include the support contact, and hero/audience/benefit content competed for space. | Added an expandable support chat to the hamburger drawer, shortened the phone hero subtitle to two lines, kept the phone title to three lines, hid audience descriptions, and showed only three benefit cards. |
| The portfolio action and compact contact form needed clearer phone treatments. | Changed the phone action to a stronger “View more” button, added a short question invitation, and moved contact prompts inside the fields while preserving accessible labels. |

All visual overrides are scoped to `.neo-homepage-shell` or `.neo-homepage` inside media queries below 640px. The shared marketing components gain class hooks and an optional shell class. Other routes keep their layouts. Font families and weights remain global.

## Verification

- Type check: `pnpm --filter @edicut/web typecheck` passed.
- Production client/server build: `pnpm --filter @edicut/web build` passed.
- `git diff --check` passed.
- At all three phone widths, page width stays within the viewport and inspected headings, cards, and form fields have no horizontal overflow.
- On the 319px browser preview, confirmed the hero label is shorter, metrics are hidden, the client logos scroll in one row, the pricing intro is centered, the contact copy and fields share one card, and footer lead alignment is centered.
- Rechecked the new 319px wording, portfolio button visibility, contact label alignment and single-line reply address, and centered footer input. At 1234 × 884, desktop wording, component visibility, and section dimensions match the saved baseline.
- At 319px, verified the hamburger support card opens and closes while the floating launcher stays hidden; the hero uses three title lines and a two-line subtitle, only three benefit cards show, and the contact form displays its prompts inside the fields with no horizontal overflow. Desktop retains its original hero wording, four benefit cards, labeled contact fields, and no phone-only portfolio action.
- Kept the support action compact: the drawer button sits above Sign in with matching styling, and expands upward to a single WhatsApp button.
- Navigation opens and closes with Escape; support opens/closes; FAQ answers expand; footer navigation opens; portfolio selection works with Home/End and stays aligned after horizontal scrolling.
- Contact fields remain required, with 48px inputs, a 112px textarea, and 16px font sizes. Forms were inspected without sending an inquiry or signing up.
- Desktop section positions, dimensions, padding, heading sizes/line heights, and footer height exactly match the saved baseline.
- Browser logs show the pre-existing Vite websocket connection issue. Verification used explicit reloads. ESLint is blocked by the existing missing `../rules` dependency error.

Raw phone checks and desktop comparisons are in `previews/mobile-verification.json` and `previews/desktop-layout-{before,after}.json`. Follow-up: repair the existing ESLint installation and preview HMR port configuration.

## Saved previews

- [390px hero](previews/mobile-390.jpg)
- [320px hero](previews/mobile-320.jpg)
- [430px creator cards](previews/mobile-430.jpg)
- [FAQ](previews/mobile-faq.jpg)
- [Contact form](previews/mobile-contact.jpg)
- [Footer](previews/mobile-footer.jpg)

# Affiliate program film and signup page

For Google AI Studio downloads, the working API handoff, source preservation,
and timing a new take, follow [VIDEO_CREATION_GUIDE.md](VIDEO_CREATION_GUIDE.md).

Created 22 October 2026 for `/affiliate-signup`.

## Visual direction

The page and film follow the homepage's neomorphic studio style: pale slate
surfaces, dark DM Sans typography, red accents, soft raised SVG cards, and the
original EdiCut logo. The desktop page pairs the story and film with a sticky
application card. At smaller widths it becomes a single column. The application
remains linked through the admin toolbar; this change adds no public navigation
link to the signup page.

`AffiliateProgramArtwork.tsx` contains six original vector scenes: a creator
recommendation, application review, a referral link and coupon, default rewards,
the affiliate dashboard, and an EdiCut closing scene. The cast is entirely male:
an original red-jacket partner in `/artwork/affiliate/partner.svg` and the
homepage's established male manager SVG. It uses the authentic logo. Example referral codes in the
artwork are illustrative, not active customer coupons.

## Narration

The current affiliate film uses **Ludo**, the male Google AI Studio voice
described as confident and clear with a low pitch. A fresh take was rendered
through Google's official Gemini speech API using `gemini-3.8-flash-tts`.
The full transcript and delivery style are recorded in
`scripts/data/affiliate-ludo-voiceover.json`. The source is mono 16-bit PCM
at 24 kHz. This voice change applies to the affiliate film.

Spoken script:

Recommend EdiCut to creators, and earn when they choose their next editing package.

Apply to become a partner. We review your application and confirm your individual terms.

Once approved, get your personal referral link and coupon code.

By default, your coupon gives customers ten percent off. Eligible paid orders earn you a ten percent commission.

Track referred orders, earnings, and payout requests in your affiliate dashboard.

Your final rates and payout terms are confirmed after review. EdiCut. Share good editing. Grow together.

The current source is `media/audio/affiliate-ludo/affiliate-ludo-source.wav`,
34.52 seconds. Its SHA-256 is
`ced3badb5e1a8a264ddc5db318a48dd5c7b66d51105b81bd0a99f355aba38b2d`.
`scripts/data/affiliate-ludo-cues.json` records measured scene and speech
onset times from this render and binds the cue sheet to that source checksum.

The earlier Google AI Studio/Nika take remains in
`media/audio/affiliate/affiliate-nika-source.wav` as an unreferenced historical
source; the website no longer points to it. The offline Microsoft Mark take is
also retained locally as a previous version. The active player uses Google Ludo.

## Music, mixing, and browser delivery

To reproduce the current mix, run from the repository root:

```powershell
python scripts/compose_affiliate_program_audio.py
```

For a new Google recording, `scripts/generate_google_affiliate_voice.py` follows
the official [Google speech API](https://ai.google.dev/gemini-api/docs/speech-generation)
and preserves existing source files. Measure new cue points before mixing a new
take. The current mixer imports the existing homepage music composer from
`compose_why_hire_us_audio.py`, using 80 BPM, D major, seed `20261022`, a
0.8-second music lead-in, a 0.65-second tail, speech-driven ducking, and a
−1.5 dBTP estimated ceiling. The music bed is scaled to 12 dB below the voice
in overall RMS level, and the mix receives 1.85 dB of peak normalization.
No sampled music is used. Dependencies are NumPy,
SciPy, and imageio-ffmpeg.

The current mix is **35.97 seconds**. It has zero clipped samples and all
samples are finite; WAV sample peak is −1.541 dBFS, estimated four-times
oversampled true peak is −1.500 dBTP, and RMS is −21.972 dBFS. These signal
checks do not replace a listening review of pronunciation and music balance.

The browser receives a 128 kbps stereo AAC/M4A file with faststart metadata:
`/audio/affiliate/affiliate-program-275a0ee6.m4a`, **593,373 bytes**. It is
loaded only after the visitor presses Play (`preload="none"`). Source WAV,
instrumental, mixed WAV, cue sheet, and the complete metrics/hash report remain
in `media/audio/affiliate-ludo/`. The old public assets are retained but no
longer referenced. The hash-named asset prevents stale audio caches.

The mixer emits `affiliate-film-content.ts`; scene and caption points are based
on measured speech onsets and pauses in the current Ludo recording, with the
music lead-in added. Whisper base.en transcription matches all 82 script words
after normalizing percentages. Sentence onsets were checked against 10 ms PCM
energy windows, and scene transitions are centered in paragraph pauses:

| Start | Scene |
| --- | --- |
| 0.00 s | Creator recommendation |
| 5.97 s | Application review |
| 11.66 s | Personal referral link and coupon |
| 15.70 s | Default customer discount and commission |
| 22.79 s | Affiliate dashboard |
| 28.13 s | Individual terms and branded close |

## Player behavior

The player samples `audio.currentTime`; it does not advance scenes with timers.
Pause and buffering freeze the artwork clock. Playback pauses when the film
leaves the viewport or the tab is hidden. Play, pause, resume, replay, retry, and
mute controls are keyboard accessible. Scene changes crossfade at measured
pauses, with at most two memoized illustrations mounted. Reduced-motion styles
show the current static scene. Captions follow the narration, and a readable
transcript provides the complete text alternative.

The existing signup loader, action, application states, phone/social fields,
and approval requirements remain in use. The page clearly identifies 10% rates
as defaults and explains that individual terms may differ.

## Validation

- The current Google Ludo source is mono 24 kHz 16-bit PCM, 34.52 seconds,
  with zero clipped samples and finite samples. Its checksum is recorded above.
- The mixed WAV is stereo 24 kHz, 35.97 seconds, with zero clipped samples,
  finite samples, and an estimated true peak of −1.500 dBTP.
- The public AAC asset decodes successfully and its hash matches the filename;
  the generated TypeScript timeline points to that new immutable asset.
  Decoded AAC has zero clipped samples, finite samples, and an estimated
  four-times oversampled true peak of −1.456 dBTP.
- `pnpm --filter @edicut/web typecheck`, `pnpm --filter @edicut/web build`,
  and the seven affiliate film timeline tests passed. The build emits React
  Router v8 future-flag notices, but completed successfully.
- The old takes and public assets remain in place, but only the new Ludo asset
  is referenced by the affiliate film.
- The runtime label now derives from the generated mix duration.
  The audio preview is available at `apps/web/public/audio/affiliate/affiliate-program-275a0ee6.m4a`.
- Browser playback loaded that new asset with a 35.97-second duration. At
  13.986 seconds, the referral scene and caption matched and remained fixed
  while paused. Resume reached 35.97 seconds on the branded closing scene,
  with Replay available and no console errors or warnings. A preview is saved
  as `artifacts/affiliate-google-ludo-2026-10-22.png`.

## Cast and spacing revision

The illustrated cast was updated to male characters on 22 October 2026. The new
partner is an original lightweight SVG, scoped to this film.

The scene audit widened the recommendation labels, good-fit callout, shared
opportunity callout, and review confirmation badge. Dashboard charts now have
separate space below their headings. The customer discount card was moved clear
of the package title and payment confirmation icon. Card text has at least 12 SVG
units of horizontal clearance, with no overflowing text in any of the six scenes.

All nine caption cues were inspected at 14 viewport widths from 320 to 1280 px.
The narrow-phone caption area reserves the longest title and caption, keeping
the controls stationary between scenes. No horizontal page overflow was found;
play and mute controls remained 44 px high. Desktop and mobile scenes were
visually reviewed with temporary media/viewport emulation, then normal playback
and the original viewport were restored. Type checking, the production build,
and the seven existing film timeline tests passed.

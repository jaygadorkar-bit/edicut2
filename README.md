# EdiCut

EdiCut is a video editing platform for YouTube creators. This repository is a pnpm monorepo with the web app, shared packages, and a compatibility API package.

## Workspace

- `apps/web`: the only frontend app. React Router 7, Vite, Tailwind, Cloudflare Worker deployment.
- `apps/node-api`: Hono API for backend endpoints.
- `packages/shared`: shared contracts and utilities.
- `packages/db`: Drizzle/PostgreSQL data layer.
- `packages/platform-core`: shared platform logic, including auth-oriented helpers.

Frontend architecture and contribution guidance: [apps/web/README.md](apps/web/README.md).

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the frontend on EdiCut's local port (3002 avoids conflicts with other local apps):

```bash
pnpm dev
```

Frontend URL: `http://localhost:3002`

Run the Node API:

```bash
pnpm dev:node-api
```

API URL: `http://localhost:8787/api/node`

## Docker

Start the web-only local container. It reads the live database and Cloudinary configuration from `.env.cloudflare`:

```bash
docker compose up --build web
```

The Docker development profile disables the production-domain reCAPTCHA keys for `localhost`; production re-enables them through its Cloudflare environment.

Docker exposes:

- Web: `http://localhost:3002`

Local Google OAuth uses the callback `http://localhost:3002/api/auth/callback/google` and returns to the app on the same port. Add this exact callback to the Google OAuth client's authorized redirect URIs.

The local Postgres and Node API containers are not part of the Docker workflow. The previous Postgres volume is retained but is no longer mounted or started.

## Quality

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm health
pnpm audit --prod
```

## Why Hire Us hero audio

The current `/why-hire-us` introduction uses the dashboard-focused, 86-word narration generated on **2026-10-08** in **Google AI Studio, Chrome**:

- Model: `gemini-3.8-flash-tts`; voice: **Nika** (Commercial Voiceover, warm and approachable, medium pitch).
- Temperature: **1.0**; single speaker and one continuous speech block; `<short pause>` between paragraphs.
- Delivery: warm, confident, conversational, neutral American English; clear dashboard actions; pronounce EdiCut “ED-ee-cut.” The separate Style field requested about 140 words per minute. Actual take: **36.64 seconds**.
- This was delivery/prompt tuning; no model weights were fine-tuned. The exact script and Style prompt are saved in [the voiceover guide](docs/WHY_HIRE_US_VOICEOVER.md).
- User-downloaded source: `media/audio/Generated Audio October 08, 2026 - 4_38AM.wav` — 24 kHz, mono, 16-bit PCM. Preserve this original.
- Music: original local NumPy/SciPy synthesis, **80 BPM, D major**, seed `20261008`; soft pads, electric-piano plucks and light percussion. No sampled track or external music-generation model was used.
- Mix: stereo, 24 kHz, with a **1.0-second music-only lead-in** before the narration; the full mix is **37.64 seconds**. Music uses gentle speech-driven ducking (40 ms attack, 300 ms release, 0.54–0.72 gain) and averages **6.90 dB below the voice**; mix sample peak **−1.63 dBFS**, no clipped samples. These are peak/RMS measurements, not LUFS loudness certification.

Recreate the music and mix from the repository root (Python with `numpy` and `scipy` installed):

```powershell
python scripts/compose_why_hire_us_audio.py --narration "media/audio/Generated Audio October 08, 2026 - 4_38AM.wav" --public-dir apps/web/public/audio/why-hire-us --lead-in 1
```

Outputs: `media/audio/edicut-why-hire-us-music.wav`, `media/audio/edicut-why-hire-us-mix.wav`, and the JSON measurement/provenance report. The public directory contains the stable mix plus an immutable hash-named copy, `apps/web/public/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav`, used by the hero.

`WhyHireUsFilm.tsx` uses this single mix. `why-hire-us-film-timeline.ts` stores narration boundaries and samples layered scene transitions; the scene cues are shifted one second to follow the music-only intro. `WhyHireUsArtwork.tsx` renders the matching team, editing, dashboard, feedback/download, plan, and closing artwork. Scenes dissolve with a gentle glide/scale over 850 ms, starting 380 ms before each narration boundary and finishing 470 ms after it. Headings and captions have staggered fades; opening playback blends from the poster over 700 ms. All motion uses the audio clock, freezes on pause/buffering, and respects reduced motion. If narration changes, measure the new take and update its scene/caption cues. The older six-part workflow audio is superseded for this hero.

The website uses the first eight characters of the mix SHA-256 in the audio filename so Cloudflare serves each revision as a new immutable asset. Update it in `why-hire-us-film-timeline.ts` whenever the mix changes. The current mix hash prefix is `f3907247`. The first mix's music was too quiet at 21.01 dB below narration; the first revision raised its relative level by about 12.38 dB. The latest revision increases that music gain by another **20% (1.2× / +1.58 dB)**, with automatic master attenuation to preserve peak headroom.

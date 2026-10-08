# Studio Pipeline Audio System Guide

> **Target Route:** [`/why-hire-us`](../apps/web/app/routes/why-hire-us.tsx)<br>
> **Audio Asset Directory:** `apps/web/public/audio/workflow/` (generated locally)<br>
> **Generation Script:** [`scripts/recreate_professional_audio.py`](../scripts/recreate_professional_audio.py)

---

## 1. System Overview & Architecture

The **Living Studio Pipeline** on `/why-hire-us` is an animated web section designed in the clean, minimal aesthetic of EdiCut (matching the `/contact` page). Rather than embedding an MP4 video or heavy third-party video player, it uses:

1. **Lightweight SVG Vector Artworks:** 6 bespoke scenes styled with soft pastel halos (`#e6edf3`), tilted debossed cards, and the authentic brand palette.
2. **Synchronized Neural Audio Narration:** High-fidelity voiceover narration that streams seamlessly as each phase unfolds.
3. **Event-Driven Transition Loop:** A React HTML5 audio engine that synchronizes visual animations, kinetic caption pills, and track progression based on real speech completion.

```
[ HTML5 Audio Engine ] ──(starts scene track)──> [ SVG Scene Animates ]
         │                                                 │
   (speech finishes)                                       │
         ▼                                                 ▼
[ 'ended' event fires ] ──(+800ms natural breath)──> [ Next Scene Triggered ]
```

---

## 2. Voiceover Scripts & Scene Metadata

Each scene's script is calibrated with commas, periods, and em-dashes (`—`) to provide the neural synthesis engine with natural human breathing pauses and conversational emphasis:

### Phase 01: Footage Ingest
- **Title:** Private Cloud Footage Handoff
- **Asset:** `/audio/workflow/scene1.mp3`
- **Duration:** ~15.96 seconds
- **Verbatim Voiceover Script:**
  > *"Phase one: Footage Intake. Say goodbye to expired transfer links. Simply connect your private Google Drive, Dropbox, or Frame.io folder directly to your EdiCut workspace—zero upload drag, complete NDA security."*
- **Subtitle:**
  > *"Phase 1: Connect Google Drive, Dropbox, or Frame.io directly to your EdiCut workspace. Zero upload drag."*

### Phase 02: Style DNA
- **Title:** Channel DNA & Style Sync
- **Asset:** `/audio/workflow/scene2.mp3`
- **Duration:** ~11.33 seconds
- **Verbatim Voiceover Script:**
  > *"Phase two: Channel DNA Sync. Before touching the timeline, your dedicated editor analyzes your audience retention curve, hook pacing, and signature brand style."*
- **Subtitle:**
  > *"Phase 2: Your dedicated editor synchronizes with your audience retention curve, hook pacing, and visual style."*

### Phase 03: Rough Cut
- **Title:** Narrative Assembly & Trimming
- **Asset:** `/audio/workflow/scene3.mp3`
- **Duration:** ~11.50 seconds
- **Verbatim Voiceover Script:**
  > *"Phase three: The Narrative Cut. We eliminate dead air, filler words, and awkward pauses, sculpting a tight, high-retention story spine with seamless multicam flow."*
- **Subtitle:**
  > *"Phase 3: Dead air and filler words eliminated. Pacing sculpted for maximum YouTube retention."*

### Phase 04: Audio & VFX
- **Title:** Kinetic Captions & Sound Mastering
- **Asset:** `/audio/workflow/scene4.mp3`
- **Duration:** ~12.16 seconds
- **Verbatim Voiceover Script:**
  > *"Phase four: Studio Polish. Next comes kinetic typography, punchy sound design, cinematic color grading, and broadcast audio mastering calibrated to YouTube loudness standards."*
- **Subtitle:**
  > *"Phase 4: Kinetic captions, custom sound effects, cinematic color grade, and broadcast audio mastering."*

### Phase 05: Studio QA
- **Title:** Creative Director Quality Gate
- **Asset:** `/audio/workflow/scene5.mp3`
- **Duration:** ~11.86 seconds
- **Verbatim Voiceover Script:**
  > *"Phase five: Director Pre-Flight QA. Before you ever see a cut, our senior creative director scrutinizes every single frame for pacing, typos, and audio balance."*
- **Subtitle:**
  > *"Phase 5: Internal Creative Director inspection. Every frame is vetted for pacing, typos, and sound balance."*

### Phase 06: Final Delivery
- **Title:** 48h Delivery, Shorts & Thumbnails
- **Asset:** `/audio/workflow/scene6.mp3`
- **Duration:** ~11.95 seconds
- **Verbatim Voiceover Script:**
  > *"Phase six: Guaranteed 48-Hour Delivery. Your first cut arrives in your workspace right on schedule—ready to review, complete with vertical Shorts and high-CTR thumbnails."*
- **Subtitle:**
  > *"Phase 6: Guaranteed 48-hour delivery. 4K export delivered with vertical Shorts and custom thumbnails."*

---

## 3. Voice Model & Prosody Configuration

- **Voice Model:** `en-US-BrianMultilingualNeural`
  - Selected for deep vocal resonance, authentic pitch modulation, and natural respiratory pauses.
  - Outperforms older voices (`en-US-GuyNeural`, `en-US-AndrewMultilingualNeural`) by avoiding metallic compression or robotic monotone cadence.
- **Pacing Rate:** `+0%`
  - Retaining natural 1.0x human speaking speed ensures technical terms like *"Frame.io"*, *"NDA security"*, and *"multicam flow"* are pronounced with crisp articulation.
- **Punctuation Rules for Neural TTS:**
  - **Em-dashes (`—`):** Create realistic mid-sentence cadence shifts without artificial verbalization.
  - **Commas (`,`):** Introduce ~150–250ms micro-breaths.
  - **Periods (`.`):** Introduce ~350–500ms section pauses.

---

## 4. How to Generate or Regenerate the Audio

The repository includes a dedicated Python generation script in [`scripts/recreate_professional_audio.py`](file:///e:/development/Edicut/scripts/recreate_professional_audio.py).

### Step 1: Install Dependencies
Ensure Python 3.10+ is available, then install `edge-tts`:
```bash
pip install edge-tts
```

### Step 2: Run the Generation Script
Run the script from the root of the repository:
```bash
python scripts/recreate_professional_audio.py
```

### What the Script Does:
1. Connects to Microsoft Azure Speech Neural endpoint via WebSocket.
2. Streams audio chunks with the `en-US-BrianMultilingualNeural` model.
3. Automatically writes 6 optimized MP3 files directly into:
   ```
   apps/web/public/audio/workflow/scene1.mp3
   apps/web/public/audio/workflow/scene2.mp3
   apps/web/public/audio/workflow/scene3.mp3
   apps/web/public/audio/workflow/scene4.mp3
   apps/web/public/audio/workflow/scene5.mp3
   apps/web/public/audio/workflow/scene6.mp3
   ```

---

## 5. Frontend Implementation Architecture

The player logic is implemented in [`apps/web/app/routes/why-hire-us.tsx`](file:///e:/development/Edicut/apps/web/app/routes/why-hire-us.tsx).

### A. Scene Configuration Data
```tsx
const videoScenes = [
  {
    phase: "01",
    tag: "Footage Ingest",
    title: "Private Cloud Footage Handoff",
    audioSrc: "/audio/workflow/scene1.mp3",
    duration: 15.6,
    narration: "...",
    subtitle: "...",
    component: ArtworkScene1Intake,
  },
  // ... phases 02 through 06
];
```

### B. Persistent Audio Mount & Event Listener
```tsx
useEffect(() => {
  if (typeof window === "undefined") return;

  const audio = new Audio();
  audio.preload = "auto";
  audioRef.current = audio;

  const handleEnded = () => {
    // 800ms natural breathing delay after narration ends before advancing scene
    setTimeout(() => {
      setCurrentScene((prev) => (prev + 1) % videoScenes.length);
    }, 800);
  };

  audio.addEventListener("ended", handleEnded);

  return () => {
    audio.removeEventListener("ended", handleEnded);
    audio.pause();
    audio.src = "";
  };
}, []);
```

### C. Track Playback & Dynamic Backstop
```tsx
useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;

  const scene = videoScenes[currentScene];
  if (!scene) return;

  // Prevent restarting track if already loaded
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  let isSameTrack = false;
  try {
    const url = new URL(audio.src, currentOrigin);
    isSameTrack = url.pathname === scene.audioSrc;
  } catch {
    isSameTrack = false;
  }

  if (!isSameTrack) {
    audio.src = scene.audioSrc;
    audio.currentTime = 0;
  }

  audio.muted = isMutedRef.current;
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // If browser autoplay policy blocks unmuted audio on initial load,
      // seamlessly fall back to muted so visual pipeline continues
      if (!isMutedRef.current) {
        setIsMuted(true);
        audio.muted = true;
        audio.play().catch(() => {});
      }
    });
  }

  // Safety fallback timer: ONLY fires if audio stalls or errors
  // Calculated dynamically as scene duration + 3.0s buffer
  const safetyMs = Math.round((scene.duration + 3.0) * 1000);
  const fallbackTimer = setTimeout(() => {
    setCurrentScene((prev) => (prev + 1) % videoScenes.length);
  }, safetyMs);

  return () => {
    clearTimeout(fallbackTimer);
  };
}, [currentScene]); // Note: Depends ONLY on currentScene, NOT isMuted
```

---

## 6. Critical Gotchas & Troubleshooting

### Why Sentences Cut Off in Previous Implementations
- **Issue:** Earlier versions had a hardcoded `fallbackTimer = setTimeout(..., 9000)`. Because all narration clips are 10.5–16.0s long, this 9-second timer triggered while the speaker was still talking, cutting off sentences mid-word.
- **Rule:** Never use a hardcoded timeout shorter than the longest possible narration track. Primary advancement **must always** be driven by the audio element's native `ended` event. The fallback timer must be dynamically calculated (`trackDuration + 3000ms`).

### Mute Toggle Decoupling
- **Issue:** If `isMuted` is included in the track playback `useEffect` dependency array, clicking the Mute button causes the entire effect to re-run, reloading `audio.src` and resetting playback to 0.0s.
- **Rule:** Keep track switching dependent **only** on `[currentScene]`. Manage `audio.muted` via a separate single-purpose effect or direct handler:
```tsx
useEffect(() => {
  if (audioRef.current) {
    audioRef.current.muted = isMuted;
  }
}, [isMuted]);
```

### Browser Autoplay Policies
- Modern browsers (Chrome, Edge, Safari) prohibit unmuted audio autoplay until the user interacts with the page (click, tap, scroll).
- If unmuted playback is rejected, the `.catch()` block automatically falls back to `audio.muted = true`. The user can click the bottom-center mute button at any time to unmute audio.

---

## 7. Premium Subscription Upgrades to Maximize Audio Quality

While `en-US-BrianMultilingualNeural` is currently the highest-rated free neural voice, you can upgrade to paid studio APIs for even higher cinematic realism:

### Option A: ElevenLabs (Industry Gold Standard)
- **Why Choose It:** Unmatched human realism, natural micro-breaths, dynamic emotional delivery, and custom voice design/cloning.
- **Plans:**
  - **Starter:** $5/month (30,000 characters) — more than enough to generate and maintain all workflow tracks.
  - **Creator:** $22/month (100,000 characters, higher quality 192kbps output + commercial license).
- **Recommended Voices:** `Adam` (deep narrative), `Antoni` (tech explainer), `Marcus` (authoritative studio voice).
- **Implementation:**
  ```python
  from elevenlabs.client import ElevenLabs
  client = ElevenLabs(api_key="YOUR_API_KEY")
  audio = client.text_to_speech.convert(
      voice_id="pNInz6obpgDQGcFmaJgB", # Adam
      text="Phase one: Footage Intake...",
      model_id="eleven_multilingual_v2"
  )
  ```

### Option B: Google Cloud Text-to-Speech (Studio & Journey Voices)
- **Why Choose It:** Enterprise-grade 48kHz audio recorded by professional human voice artists in physical recording studios.
- **Tiers:**
  - **Studio Voices:** Specifically optimized for long-form narrative and marketing explainers (e.g. `en-US-Studio-O`, `en-US-Studio-Q`).
  - **Journey Voices:** Conversational and expressive with adaptive pacing (e.g. `en-US-Journey-F`, `en-US-Journey-D`).
- **Pricing:** Pay-as-you-go via Google Cloud Console. First 1,000,000 characters free every month, then $16 per 1M characters.
- **Implementation:**
  ```python
  from google.cloud import texttospeech
  client = texttospeech.TextToSpeechClient()
  voice = texttospeech.VoiceSelectionParams(
      language_code="en-US",
      name="en-US-Studio-O"
  )
  ```

### Option C: OpenAI TTS-1-HD
- **Why Choose It:** High-definition 44.1kHz speech with natural warmth and instant generation.
- **Pricing:** $0.030 per 1,000 characters (costs less than $0.05 to generate the entire EdiCut pipeline).
- **Recommended Voices:** `onyx` (deep, warm male narrator), `nova` (friendly studio narrator).

---

## 8. Background Music & Audio Layering (Google MusicFX & Web Mixing)

### Can Google Cloud TTS Add Background Music?
**No.** Google Cloud Text-to-Speech and Gemini Audio are purely speech synthesis engines; they do not mix instrumental background music into the speech audio file.

### Can You Generate Background Music with Google?
**Yes, via Google MusicFX (Google AI Test Kitchen / DeepMind MusicLM):**
- **URL:** [Google AI Test Kitchen - MusicFX](https://aitestkitchen.withgoogle.com/tools/music-fx)
- **How It Works:** Google's generative music model creates custom, royalty-free instrumental audio tracks from text prompts.
- **Recommended Prompts for EdiCut Studio Pipeline:**
  - *"Subtle modern tech ambient corporate background music, soft synthesizer pads, warm Rhodes piano, no harsh drums, minimal percussion, 95 bpm, inspiring and clean"*
  - *"Lo-fi minimalist ambient soundscape, warm sub-bass, soft filtered electronic keyboard, calm productive studio atmosphere, royalty free"*
- **Output:** Downloadable as a high-bitrate `.wav` or `.mp3` loop.

### How to Implement Background Music in the Living Pipeline

There are two recommended architectures:

#### Method 1: Continuous Client-Side Ambient Bed (Recommended)
Rather than baking music into each separate speech file, run a dedicated looping HTML5 background track (`/audio/workflow/ambient-bed.mp3`) at 12–15% volume in the web player.

**Advantages:**
- The background music plays smoothly and continuously across scene changes (it doesn't start and stop when switching from Phase 01 to Phase 02).
- The Mute button instantly controls both tracks simultaneously.
- Zero extra file weight for each individual voiceover MP3.

```tsx
// Dual-Audio Layer Architecture
const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
const musicAudioRef = useRef<HTMLAudioElement | null>(null);

useEffect(() => {
  const music = new Audio("/audio/workflow/ambient-bed.mp3");
  music.loop = true;
  music.volume = 0.12; // Subtle background level (12%)
  musicAudioRef.current = music;
}, []);

const toggleMute = () => {
  setIsMuted((prev) => {
    const next = !prev;
    if (narrationAudioRef.current) narrationAudioRef.current.muted = next;
    if (musicAudioRef.current) {
      musicAudioRef.current.muted = next;
      if (!next) musicAudioRef.current.play().catch(() => {});
    }
    return next;
  });
};
```

#### Method 2: Python / FFmpeg Audio Ducking (Pre-Mixed)
If you prefer a single pre-mixed file per scene, use Python with `pydub` or `ffmpeg` to overlay the background music with automatic speech ducking (-18dB while the voice is speaking, rising back to -12dB during pauses).

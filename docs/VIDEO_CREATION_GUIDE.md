# Video creation guide: Google AI Studio narration

This guide documents the repeatable workflow used for EdiCut's narrated films, including work performed by Luna and Sol agents. A missing browser download is a tool or session limitation, not a reason to substitute an offline voice. Use this process when a new voice track is needed. When the request is to reuse an approved video, reuse its narration and mix: the custom “3 reasons why you should hire EdiCut” article uses the actual homepage `WhyHireUsFilm`, its native SVG artwork, and approved audio clock.

## 1. Prepare the script and voice direction

Keep the spoken transcript separate from delivery direction. Put exact words in the transcript and sustained guidance—tone, accent, pace, pronunciation, and pauses—in the style field or `speech_metadata`. Add only supported short-pause markers where a real pause belongs; they are production cues, not spoken words. Read the transcript aloud and check names, numbers, claims, and pronunciation before rendering.

For the current affiliate narration, the selected voice is **Ludo**, the male Google AI Studio voice described as confident and clear with a low pitch. The configuration is `scripts/data/affiliate-ludo-voiceover.json`; the recorded source and mix details are in `docs/AFFILIATE_PROGRAM_FILM.md`. The homepage narration is a different approved take using Nika. Do not describe either voice as a human recording.

## 2. Generate and save a source WAV

### Normal path: download from AI Studio

1. Open Google AI Studio and select the intended Gemini TTS model and voice. For the current projects, the documented model is `gemini-3.8-flash-tts`; confirm the active model and voice in the UI rather than assuming saved settings carried over.
2. Enter the approved transcript and style, generate a take, and listen through the full result. Check pronunciation, pacing, pauses, and whether the read matches the intended tone.
3. Use AI Studio's normal **Download** action. Save the WAV into a new, project-specific directory under `media/audio/`, with a unique source filename. Do not overwrite an approved source.
4. Verify that the file exists at the expected local path, opens as audio, and plays from beginning to end. Record its duration, file size, and SHA-256 checksum before mixing.

The standard UI download should be tried first. A failure to save a file in one browser session does not mean AI Studio cannot download audio. Do not recover audio by exporting or extracting embedded data URLs, inspecting hidden session storage, using raw Chrome DevTools Protocol, or switching browser surfaces to evade a browser or app guard.

### Fallback: make a fresh take through Google's documented API

If the ordinary download is unavailable, generate a **new** recording through the official Gemini speech API with the selected voice, approved transcript and style, and an already-authorized Google project within the user's approved spending scope. The current affiliate example uses Ludo and an existing free-tier project. A new render is a new take: listen to it and measure its timing again even when the text and voice are unchanged.

Use the one-session local handoff helper. It binds only to `127.0.0.1`, chooses a random port and path, serves a password form, checks the POST origin, and exits after completion. Start it from the repository root with a unique output directory:

```powershell
python scripts/google_voiceover_handoff.py --config scripts/data/affiliate-ludo-voiceover.json --output-dir media/audio/affiliate-ludo-take-02 --source-name affiliate-ludo-source.wav
```

Open the printed `http://127.0.0.1:<random-port>/<random-path>` URL locally. In Google AI Studio, retrieve the existing authorized key through its visible key details UI into a temporary CUA variable, without printing or logging it. When a dialog contains the full key, keep its DOM snapshot in memory and redact credential patterns before output; do not emit its full accessibility tree or a screenshot. Enter the value only into the local helper's password field. The helper passes it in memory to the generator; the generator sends the authenticated request over HTTPS to Google's official API endpoint. It writes a new WAV and non-secret generation metadata. Do not put a key in a transcript, repository file, command argument, shell history, URL, report, or log. Do not create a key, grant access, enable services, or change billing without the required confirmation.

After submitting the password form, clear the temporary CUA variable immediately or reset the CUA session. If a clipboard was used, restore its original contents; when it was empty, clear it with `writeText('')`. Keep the helper's random local URL private to the active session. Never paste a real key into chat or a normal shell command. If the helper is unavailable, stop and resolve the local setup; do not bypass its safeguards.

The generator uses unary Gemini 3.8 TTS and requests WAV at 24 kHz. Google's documentation describes unary TTS output as a complete mono, 16-bit PCM WAV with a RIFF header; streaming output has different, headerless PCM behavior. The script validates the WAV format and expected duration before saving. See [Google's TTS guide](https://ai.google.dev/gemini-api/docs/speech-generation) and [Gemini 3.8 Flash TTS model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts).

For a deliberate non-browser invocation, `scripts/generate_google_affiliate_voice.py` accepts `--config`, `--output-dir`, and `--source-name`. Use the same unique directory and supply `GEMINI_API_KEY` through an approved process-level secret mechanism; never put the key literal in the command. Prefer the local handoff helper for browser-assisted work.

### Luna execution checklist

1. Read this guide and the film's project document. Locate the existing transcript/config, source recording, cue sheet, mixer, and player before generating anything.
2. For a different project, copy the example JSON into a new file in `scripts/data/`. Keep its `model`, `voice`, `style`, and `scenes[].cues[].text` fields; replace the spoken text and direction deliberately. The generator joins cues with supported short pauses. Never point a new project's render at an approved source directory.
3. Try AI Studio's visible Download action with the documented `cua_repl` download APIs. A preview or successful click is not a saved file: verify the returned download path and actual WAV on disk.
4. If no download file is available, start the local handoff command above. Use only documented CUA browser controls to open AI Studio's **Get API key** page and the existing project's key details. Read the revealed value into a temporary variable without returning it from the tool call. Redact any observation that contains credentials before displaying it. Do not create a key to work around an inaccessible existing one.
5. Open the printed localhost form in the same controlled browser, fill its **Gemini API key** password field from that variable, and submit. Clear the variable immediately. The status must reach `complete`; verify the resulting WAV and `google-generation-report.json` under the chosen output directory. A failed job is not completion.
6. Create a new cue sheet for this exact take, then run the project's mixer. For another film, adapt the mixer and generated player configuration explicitly; the affiliate mixer writes affiliate film content, so do not run it unmodified for a different film.
7. Complete the final review below. If a credential prompt, billing gate, or browser restriction requires the user, report the exact remaining step. Do not substitute another provider or offline voice for a Google voice request.

For the normal download, arm the documented download event **before** clicking
the visible download control, then call the returned download's `path()` method.
Use the control's actual accessible name from a fresh snapshot; do not assume a
button label. A `null` path is not an exported WAV. Inspect `cua_repl`'s current
browser documentation for the exact supported APIs.

For an already-authorized key, the safe handoff pattern below operates only on
the **visible, user-opened key details**. The handles `voiceTab` and `handoffTab`
must be the observed AI Studio key-details tab and the printed localhost form.
Never call `getAXState()` or `getScreenshot()` on a dialog showing a full key:
those observation helpers display their result automatically.

```javascript
// Run in cua_repl. Keep both strings out of tool output.
var keyDialogText = await voiceTab.playwright.domSnapshot();
var narrationKey = keyDialogText.match(/AIza[0-9A-Za-z_-]{35}/)?.[0];
keyDialogText = "";
if (!narrationKey) throw new Error("The existing key is not visible; inspect the UI without exposing credentials.");
try {
  await handoffTab.playwright.getByLabel("Gemini API key", { exact: true }).fill(narrationKey);
  await handoffTab.playwright.getByRole("button", { name: "Generate Google narration", exact: true }).click();
} finally {
  narrationKey = "";
}
// Observe only the helper's non-secret status after the password form submits.
```

Do not print the snapshot when the pattern fails; Google's UI or key format may
have changed. Recheck the visible controls and official documentation while
redacting secrets. Close the key dialog before ordinary screenshots or state
output resume.

## 3. Preserve and document the source

Keep each original WAV unchanged. Use a new directory or filename for every approved re-render, and record the SHA-256 hash, duration, sample rate, channel count, and bit depth. Keep generation metadata with the project: provider, model, selected voice and description, style, exact spoken script, UTC generation time, file path, checksum, and duration. Store no credentials in that metadata. The affiliate generator emits `google-generation-report.json` for this purpose.

Listen to the saved WAV—not only the web preview—and verify it matches the approved transcript. Check for clipped or silent sections, unexpected words, mispronunciations, abrupt endings, and artifacts. Technical validation supports listening review; it does not replace it.

## 4. Re-measure scenes and captions for every take

Never carry old cue times forward to a new recording, even if the script is identical. Use the local `faster-whisper` `base.en` transcription workflow, compare the normalized recognized words against the complete approved transcript, and inspect word timestamps. Check speech onsets against short PCM energy windows (the affiliate cue sheet uses 10 ms windows). Place caption cues at the actual spoken onsets and put scene changes in measured paragraph pauses. Listen and inspect every transition against the saved source.

Bind the cue configuration to the WAV's `sourceSha256` and `sourceDurationSeconds` (plus sample rate). The mixer must reject a cue sheet whose hash, duration, channel layout, or sample rate does not match the source. For the affiliate film, `scripts/data/affiliate-ludo-cues.json` demonstrates this format and records the alignment method. Account for any music lead-in only when converting source-relative cues to the final playback timeline.

## 5. Mix music locally and prepare browser audio

Treat narration and music as separate sources. EdiCut's music bed is composed locally with the NumPy/SciPy homepage composer; it was **not** generated by Google AI Studio or Lyria. The affiliate mixer imports that composer, ducks the instrumental under speech, targets the configured music level (currently 12 dB below the voice in overall RMS), and limits the estimated true peak. Reuse only an approved instrumental that fits the project, and document how it was made. Do not say Google supplied music when only the voice came from its TTS model.

For the affiliate film, mix with the project-specific cue sheet and separate output directories:

```powershell
python scripts/compose_affiliate_program_audio.py --narration media/audio/affiliate-ludo-take-02/affiliate-ludo-source.wav --scene-config scripts/data/affiliate-ludo-cues-take-02.json --output-dir media/audio/affiliate-ludo-take-02 --public-dir apps/web/public/audio/affiliate
```

The mixer checks that cue metadata matches the unchanged source, creates a WAV mix and a 128 kbps stereo AAC/M4A browser copy, gives the public asset a hash-based filename, writes generated film content, and records audio metrics. Confirm that the generated content points to the new hashed asset and the intended cues. Do not replace a currently published asset until its source, mix, transcript, timing, and preview have been reviewed.

The player should use the audio element's `currentTime` as its single clock for scenes and captions. Load audio only after the visitor chooses Play (`preload="none"`), pause playback when the film leaves view or the tab is hidden, and show a static current scene for reduced-motion preferences. Keep keyboard-operable controls and a readable transcript as an accessible alternative. These are the established affiliate film behaviors documented in `docs/AFFILIATE_PROGRAM_FILM.md`.

## 6. Final review checklist

- The saved source WAV is the intended, newly named file; its checksum is recorded and unchanged by mixing.
- The full generated speech matches the approved script and selected voice. Record listening review honestly; if tools cannot assess subjective sound, use transcript and signal checks, provide a playable preview, and state that listening quality remains unverified. Do not invent human approval or add an approval gate unless the user or an applicable policy requires it.
- Scene and caption cues were measured from this exact take, and the cue file records its hash and duration.
- The music source and method are accurately described; music is clear beneath speech without masking it.
- The mix report confirms finite samples, no clipped samples, the intended duration, and the configured peak ceiling.
- The final public audio URL uses the new hash-named asset; playback, captions, transcript, keyboard controls, offscreen pause, and reduced-motion behavior are checked.

If any check fails, keep the previous approved source and published asset intact, fix the candidate in its own output directory, and repeat the review.

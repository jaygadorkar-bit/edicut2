// Boundaries measured from the approved 2026-10-08 narration, not a timer.
export const WHY_HIRE_US_AUDIO = "/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav";
export const WHY_HIRE_US_AUDIO_LEAD_IN = 1;
export const WHY_HIRE_US_DURATION = 37.64;
export const FILM_TRANSITION_BEFORE = .38;
export const FILM_TRANSITION_AFTER = .47;
export const FILM_POSTER_TRANSITION = .7;
export const whyHireUsScenes = [
  {
    at: 0, title: "Your team. Your style.",
    cues: [
      { at: WHY_HIRE_US_AUDIO_LEAD_IN, copy: "At EdiCut, you get a dedicated editor who understands your style," },
      { at: WHY_HIRE_US_AUDIO_LEAD_IN + 4.96, copy: "and a project manager who keeps your videos on track." },
    ],
  },
  {
    at: WHY_HIRE_US_AUDIO_LEAD_IN + 8.54, title: "Every detail, handled.",
    cues: [
      { at: 0, copy: "We handle storytelling, captions, color, and sound," },
      { at: 4.2, copy: "with studio review before your draft reaches you." },
    ],
  },
  {
    at: WHY_HIRE_US_AUDIO_LEAD_IN + 15.82, title: "One dashboard. Everything together.",
    cues: [
      { at: 0, copy: "Your dashboard keeps everything in one place." },
      { at: 2.98, copy: "Start a project, share your brief and footage, and track progress." },
    ],
  },
  {
    at: WHY_HIRE_US_AUDIO_LEAD_IN + 23.5, title: "Stay connected. Keep creating.",
    cues: [{ at: 0, copy: "Communicate with your team, leave feedback on edits, and download your finished videos." }],
  },
  {
    at: WHY_HIRE_US_AUDIO_LEAD_IN + 29.04, title: "A plan that fits your channel.",
    cues: [{ at: 0, copy: "Choose a single video or a monthly plan that fits your channel." }],
  },
  {
    at: WHY_HIRE_US_AUDIO_LEAD_IN + 33.24, title: "You create. We handle the edit.",
    cues: [
      { at: 0, copy: "EdiCut." },
      { at: 1.02, copy: "You create." },
      { at: 2.22, copy: "We handle the edit." },
    ],
  },
] as const;

export function getFilmPosition(time: number) {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  let sceneIndex = 0;
  whyHireUsScenes.forEach((scene, index) => { if (safeTime >= scene.at) sceneIndex = index; });
  const scene = whyHireUsScenes[sceneIndex];
  const localTime = safeTime - scene.at;
  let cueIndex = 0;
  scene.cues.forEach((cue, index) => { if (localTime >= cue.at) cueIndex = index; });
  return { sceneIndex, cueIndex, localTime };
}

type LayerPhase = "settled" | "incoming" | "outgoing";

function ease(value: number) {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function makeLayer(sceneIndex: number, time: number, phase: LayerPhase, progress = 1, isPoster = false) {
  const scene = whyHireUsScenes[sceneIndex];
  const end = whyHireUsScenes[sceneIndex + 1]?.at ?? WHY_HIRE_US_DURATION;
  const localTime = isPoster ? 10 : Math.max(0, Math.min(time, end) - scene.at);
  let cueIndex = 0;
  scene.cues.forEach((cue, index) => { if (localTime >= cue.at) cueIndex = index; });
  const cueVisible = isPoster || localTime >= scene.cues[0].at;
  const blend = ease(progress);
  const opacity = phase === "settled" ? 1 : phase === "incoming" ? blend : 1 - blend;
  // Separate the text fades so two headings never compete at full opacity.
  const copyOpacity = phase === "settled" ? 1 : phase === "incoming"
    ? ease((progress - .34) / .58) : 1 - ease(progress / .38);
  return {
    key: isPoster ? "poster" : `scene-${sceneIndex}`, sceneIndex, cueIndex, cueVisible, localTime, isPoster, phase,
    opacity, copyOpacity,
    x: phase === "settled" ? 0 : phase === "incoming" ? 18 * (1 - blend) : -14 * blend,
    y: phase === "settled" ? 0 : phase === "incoming" ? 10 * (1 - copyOpacity) : -8 * (1 - copyOpacity),
    scale: phase === "settled" ? 1 : phase === "incoming" ? .975 + .025 * blend : 1 - .015 * blend,
  };
}

// Pure audio-time sampling: no timeouts, transition races, or accumulated drift.
export function getFilmFrame(time: number, hasStarted = true) {
  const safeTime = Number.isFinite(time) ? Math.min(WHY_HIRE_US_DURATION, Math.max(0, time)) : 0;
  const position = getFilmPosition(hasStarted ? safeTime : 0);
  if (!hasStarted) return { position, layers: [makeLayer(0, 0, "settled", 1, true)] };
  if (safeTime < FILM_POSTER_TRANSITION) {
    const progress = safeTime / FILM_POSTER_TRANSITION;
    return { position, layers: [makeLayer(0, 0, "outgoing", progress, true), makeLayer(0, safeTime, "incoming", progress)] };
  }
  for (let next = 1; next < whyHireUsScenes.length; next++) {
    const boundary = whyHireUsScenes[next].at;
    const start = boundary - FILM_TRANSITION_BEFORE;
    const end = boundary + FILM_TRANSITION_AFTER;
    if (safeTime >= start && safeTime < end) {
      const progress = (safeTime - start) / (end - start);
      return { position, layers: [makeLayer(next - 1, safeTime, "outgoing", progress), makeLayer(next, safeTime, "incoming", progress)] };
    }
  }
  return { position, layers: [makeLayer(position.sceneIndex, safeTime, "settled")] };
}

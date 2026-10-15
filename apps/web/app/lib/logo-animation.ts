export const LOGO_DURATION = 2400;
type TimedFrame = {
  at: number;
  transform: string;
  opacity?: number;
  easing?: string;
};
export type LogoTrack = { part: string; origin: string; frames: Keyframe[] };
const smooth = "cubic-bezier(0.22, 0.9, 0.35, 1)";
// Flatten the original lower edge from hinge (840, 378) to tip (1417, 292)
// against the slate, with slight overtravel to seal the rounded corner.
// Zero rotation is the logo's original, slightly open pose.
const clapperClosedAngle = (Math.atan2(86, 577) * 180) / Math.PI + 0.2;
function frames(points: TimedFrame[]): Keyframe[] {
  const full = [...points];
  if (full[0].at > 0) full.unshift({ ...full[0], at: 0 });
  if (full.at(-1)!.at < LOGO_DURATION)
    full.push({ ...full.at(-1)!, at: LOGO_DURATION });
  return full.map(({ at, easing, ...value }) => ({
    ...value,
    offset: at / LOGO_DURATION,
    easing: easing || smooth,
  }));
}
function letter(
  part: string,
  origin: string,
  start: number,
  duration = 600,
): LogoTrack {
  return {
    part,
    origin,
    frames: frames([
      {
        at: start,
        opacity: 0,
        transform: "translateY(130px) scale(1.22, 0.42)",
        easing: "cubic-bezier(0.2, 0.65, 0.3, 1)",
      },
      {
        at: start + duration * 0.18,
        opacity: 1,
        transform: "translateY(48px) scale(0.84, 1.22)",
      },
      {
        at: start + duration * 0.38,
        opacity: 1,
        transform: "translateY(-18px) scale(0.94, 1.12)",
        easing: "cubic-bezier(0.5, 0, 0.8, 0.6)",
      },
      {
        at: start + duration * 0.58,
        opacity: 1,
        transform: "translateY(6px) scale(1.13, 0.8)",
      },
      {
        at: start + duration * 0.78,
        opacity: 1,
        transform: "translateY(-3px) scale(0.97, 1.04)",
      },
      {
        at: start + duration,
        opacity: 1,
        transform: "translateY(0px) scale(1, 1)",
      },
    ]),
  };
}
/** A shared 2.4s clock makes replay, pause, speed changes and scrubbing deterministic. */
export const logoTracks: LogoTrack[] = [
  letter("E", "423px 647px", 40),
  letter("d", "623px 648px", 130),
  letter("i", "784px 648px", 220),
  {
    part: "dot",
    origin: "783px 438px",
    frames: frames([
      { at: 330, opacity: 0, transform: "translateY(80px) scale(1.2, 0.55)" },
      { at: 490, opacity: 1, transform: "translateY(-12px) scale(0.9, 1.15)" },
      { at: 580, opacity: 1, transform: "translateY(4px) scale(1.14, 0.78)" },
      { at: 660, opacity: 1, transform: "translateY(-3px) scale(0.96, 1.05)" },
      { at: 740, opacity: 1, transform: "translateY(0px) scale(1, 1)" },
    ]),
  },
  {
    part: "body",
    origin: "840px 521px",
    frames: frames([
      { at: 360, opacity: 0, transform: "scale(0.04, 1.14)" },
      { at: 460, opacity: 1, transform: "scale(0.4, 1.06)" },
      { at: 680, opacity: 1, transform: "scale(1.04, 0.965)" },
      { at: 820, opacity: 1, transform: "scale(0.988, 1.01)" },
      { at: 1000, opacity: 1, transform: "scale(1, 1)" },
    ]),
  },
  letter("C", "977px 641px", 640, 600),
  letter("u", "1195px 641px", 720, 600),
  letter("t", "1356px 641px", 800, 600),
  {
    part: "clapper",
    origin: "840px 378px",
    frames: frames([
      { at: 770, opacity: 0, transform: "translateY(18px) rotate(0deg)" },
      { at: 1030, opacity: 1, transform: "translateY(0px) rotate(0deg)" },
      {
        at: 1390,
        opacity: 1,
        transform: "translateY(0px) rotate(-6deg)",
        easing: "ease-out",
      },
      {
        at: 1460,
        opacity: 1,
        transform: "translateY(0px) rotate(-6deg)",
        easing: "cubic-bezier(0.65, 0, 0.95, 0.55)",
      },
      {
        at: 1640,
        opacity: 1,
        transform: `translateY(0px) rotate(${clapperClosedAngle}deg)`,
      },
      {
        at: 1740,
        opacity: 1,
        transform: `translateY(0px) rotate(${clapperClosedAngle}deg)`,
      },
      { at: 2040, opacity: 1, transform: "translateY(0px) rotate(-1.2deg)" },
      { at: 2220, opacity: 1, transform: "translateY(0px) rotate(0deg)" },
    ]),
  },
  {
    part: "logo",
    origin: "891px 664px",
    frames: frames([
      { at: 1600, transform: "translateY(0px) scale(1, 1)" },
      { at: 1680, transform: "translateY(3px) scale(1.014, 0.97)" },
      { at: 1800, transform: "translateY(-2px) scale(0.993, 1.016)" },
      { at: 2010, transform: "translateY(0.5px) scale(1.003, 0.995)" },
      { at: 2260, transform: "translateY(0px) scale(1, 1)" },
    ]),
  },
];

export function logoPhase(time: number) {
  if (time >= LOGO_DURATION) return "Complete";
  if (time < 640) return "Letter reveal";
  if (time < 1400) return "Cut reveal";
  if (time < 1640) return "Clapper closing";
  if (time < 1740) return "Clapper closed";
  if (time < 2220) return "Clapper reopening";
  return "Settle";
}

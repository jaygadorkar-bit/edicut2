import { affiliateFilmContent } from "./affiliate-film-content";

const before = .2;
const after = .2;
const smooth = (n: number) => { const p = Math.min(1, Math.max(0, n)); return p * p * (3 - 2 * p); };

export function getAffiliateFilmFrame(time: number, started = true) {
  const clock = Number.isFinite(time) ? Math.min(affiliateFilmContent.duration, Math.max(0, time)) : 0;
  const scenes = affiliateFilmContent.scenes;
  let active = 0;
  for (let index = 1; index < scenes.length; index++) if (clock >= scenes[index].at) active = index;
  const layer = (index: number, opacity = 1, copyOpacity = 1) => {
    const scene = scenes[index];
    let cue = 0;
    scene.cues.forEach((item, i) => { if (clock >= item.at) cue = i; });
    return { index, opacity, copyOpacity, cue, cueVisible: clock >= scene.cues[0].at,
      localTime: started ? Math.max(0, clock - scene.at) : 10 };
  };
  if (!started) return { clock: 0, active: 0, layers: [layer(0)] };
  for (let next = 1; next < scenes.length; next++) {
    const boundary = scenes[next].at;
    if (clock >= boundary - before && clock < boundary + after) {
      const p = (clock - boundary + before) / (before + after);
      return { clock, active, layers: [layer(next - 1, 1 - smooth(p), 1 - smooth(p / .45)),
        layer(next, smooth(p), smooth((p - .45) / .55))] };
    }
  }
  return { clock, active, layers: [layer(active)] };
}

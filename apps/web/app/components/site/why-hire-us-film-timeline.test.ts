import { describe, expect, it } from "vitest";
import { FILM_POSTER_TRANSITION, FILM_TRANSITION_AFTER, FILM_TRANSITION_BEFORE, getFilmFrame, getFilmPosition, WHY_HIRE_US_AUDIO_LEAD_IN, WHY_HIRE_US_DURATION, whyHireUsScenes } from "./why-hire-us-film-timeline";

describe("why hire us film timeline", () => {
  it("changes scenes at the narration boundaries", () => {
    whyHireUsScenes.forEach((scene, index) => {
      expect(getFilmPosition(scene.at)).toEqual({ sceneIndex: index, cueIndex: 0, localTime: 0 });
      if (index) expect(getFilmPosition(scene.at - .01).sceneIndex).toBe(index - 1);
    });
  });

  it("samples caption cues and the local animation clock from audio time", () => {
    expect(getFilmPosition(5.95).cueIndex).toBe(0);
    expect(getFilmPosition(5.96).cueIndex).toBe(1);
    const dashboard = getFilmPosition(20);
    expect(dashboard.sceneIndex).toBe(2);
    expect(dashboard.cueIndex).toBe(1);
    expect(dashboard.localTime).toBeCloseTo(3.18);
  });

  it("returns the final caption on completion and the first on replay", () => {
    expect(getFilmPosition(WHY_HIRE_US_DURATION).sceneIndex).toBe(5);
    expect(getFilmPosition(WHY_HIRE_US_DURATION).cueIndex).toBe(2);
    expect(getFilmPosition(0)).toEqual({ sceneIndex: 0, cueIndex: 0, localTime: 0 });
  });

  it("handles invalid and negative input without an invalid scene", () => {
    [NaN, Infinity, -Infinity, -1].forEach((time) => expect(getFilmPosition(time)).toEqual({ sceneIndex: 0, cueIndex: 0, localTime: 0 }));
  });

  it("blends the poster into playback without a blank first frame", () => {
    const poster = getFilmFrame(0, false);
    expect(poster.layers).toHaveLength(1);
    expect(poster.layers[0].key).toBe("poster");
    const beginning = getFilmFrame(0);
    expect(beginning.layers[0].opacity).toBe(1);
    expect(beginning.layers[1].opacity).toBe(0);
    expect(beginning.layers[1].cueVisible).toBe(false);
    expect(getFilmFrame(WHY_HIRE_US_AUDIO_LEAD_IN).layers.at(-1)?.cueVisible).toBe(true);
    expect(getFilmFrame(FILM_POSTER_TRANSITION).layers).toHaveLength(1);
    expect(getFilmFrame(FILM_POSTER_TRANSITION).layers[0].key).toBe("scene-0");
  });

  it("keeps both artworks mounted across every narration boundary", () => {
    whyHireUsScenes.slice(1).forEach((scene, index) => {
      const start = getFilmFrame(scene.at - FILM_TRANSITION_BEFORE + .001);
      const middle = getFilmFrame(scene.at);
      const end = getFilmFrame(scene.at + FILM_TRANSITION_AFTER + .001);
      expect(start.layers.map((layer) => layer.sceneIndex)).toEqual([index, index + 1]);
      expect(middle.layers).toHaveLength(2);
      expect(middle.position.sceneIndex).toBe(index + 1);
      expect(middle.layers[0].opacity + middle.layers[1].opacity).toBeCloseTo(1);
      expect(middle.layers[0].copyOpacity).toBe(0);
      expect(end.layers).toHaveLength(1);
      expect(end.layers[0].key).toBe(`scene-${index + 1}`);
      expect(end.layers[0].opacity).toBe(1);
    });
  });

  it("freezes outgoing artwork and deterministically samples pause, seek and replay", () => {
    const boundary = whyHireUsScenes[1].at;
    const first = getFilmFrame(boundary + .1);
    expect(first.layers[0].localTime).toBe(boundary);
    expect(first.layers[1].localTime).toBeCloseTo(.1);
    expect(getFilmFrame(boundary + .1)).toEqual(first);
    expect(getFilmFrame(WHY_HIRE_US_DURATION).layers[0].key).toBe("scene-5");
    expect(getFilmFrame(0).layers[0].key).toBe("poster");
  });

  it("has finite bounded layer styles throughout the film", () => {
    for (let time = 0; time <= WHY_HIRE_US_DURATION; time += .05) {
      const frame = getFilmFrame(time);
      expect(frame.layers.length).toBeLessThanOrEqual(2);
      frame.layers.forEach((layer) => {
        expect(layer.opacity).toBeGreaterThanOrEqual(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
        expect(layer.copyOpacity).toBeGreaterThanOrEqual(0);
        expect(layer.copyOpacity).toBeLessThanOrEqual(1);
        expect(Number.isFinite(layer.x + layer.y + layer.scale + layer.localTime)).toBe(true);
      });
    }
  });
});

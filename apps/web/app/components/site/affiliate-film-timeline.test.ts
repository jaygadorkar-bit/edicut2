import { describe, expect, it } from "vitest";
import { affiliateFilmContent } from "./affiliate-film-content";
import { getAffiliateFilmFrame } from "./affiliate-film-timeline";

describe("affiliate film audio synchronization", () => {
  it("keeps the complete poster artwork visible before playback", () => {
    const frame = getAffiliateFilmFrame(12, false);
    expect(frame.clock).toBe(0);
    expect(frame.active).toBe(0);
    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0].localTime).toBe(10);
  });

  it("clamps invalid clocks so SVG animation styles remain finite", () => {
    for (const time of [NaN, Infinity, -1, 0, affiliateFilmContent.duration + 100]) {
      const frame = getAffiliateFilmFrame(time);
      expect(Number.isFinite(frame.clock)).toBe(true);
      expect(frame.clock).toBeGreaterThanOrEqual(0);
      expect(frame.clock).toBeLessThanOrEqual(affiliateFilmContent.duration);
      for (const layer of frame.layers) expect(Number.isFinite(layer.localTime)).toBe(true);
    }
  });

  it("changes the semantic scene at each measured narration pause", () => {
    affiliateFilmContent.scenes.slice(1).forEach((scene, i) => {
      expect(getAffiliateFilmFrame(scene.at - .001).active).toBe(i);
      expect(getAffiliateFilmFrame(scene.at).active).toBe(i + 1);
    });
  });

  it("blends only two illustrations during a transition", () => {
    affiliateFilmContent.scenes.slice(1).forEach(scene => {
      const layers = getAffiliateFilmFrame(scene.at).layers;
      expect(layers).toHaveLength(2);
      expect(layers.reduce((sum, layer) => sum + layer.opacity, 0)).toBeCloseTo(1);
      expect(layers.every(layer => layer.opacity > 0 && layer.opacity < 1)).toBe(true);
    });
    for (let time = 0; time < affiliateFilmContent.duration; time += .1) {
      expect(getAffiliateFilmFrame(time).layers.length).toBeLessThanOrEqual(2);
    }
  });

  it("waits for the speech after the music lead-in before showing captions", () => {
    expect(getAffiliateFilmFrame(.5).layers[0].cueVisible).toBe(false);
    const firstCue = affiliateFilmContent.scenes[0].cues[0].at;
    expect(getAffiliateFilmFrame(firstCue - .01).layers[0].cueVisible).toBe(false);
    expect(getAffiliateFilmFrame(firstCue).layers[0].cueVisible).toBe(true);
  });

  it("switches the discount and commission captions at their actual speech boundary", () => {
    const secondCue = affiliateFilmContent.scenes[3].cues[1].at;
    expect(getAffiliateFilmFrame(secondCue - .01).layers[0].cue).toBe(0);
    expect(getAffiliateFilmFrame(secondCue).layers[0].cue).toBe(1);
  });

  it("finishes on the branded closing scene and can sample replay from zero", () => {
    expect(getAffiliateFilmFrame(affiliateFilmContent.duration).active).toBe(5);
    expect(getAffiliateFilmFrame(0).active).toBe(0);
    expect(affiliateFilmContent.scenes.every(scene => scene.cues.every(cue => cue.at < affiliateFilmContent.duration))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { inferCreatorPlatform, validateCreatorProfile, validateProjectBrief, projectBriefNotes } from "./client-intake";
import { purchaseExpiry, purchaseAllowance, isMissingClientWorkspaceSchema } from "./client-workspace.server";

function form(values: Record<string, string>) { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
export const channelValues = { channelName: "Test creator", platform: "YouTube", channelUrl: "https://www.youtube.com/@test", brandUrl: "" };
export const briefValues = { title: "Science explained", objective: "Explain the latest experiment", videoType: "YouTube video", finishedMinutes: "8", rawMinutes: "60", aspectRatio: "16:9", resolution: "1080p", deadline: "2099-12-01", footageUrl: "https://drive.google.com/drive/folders/example", scriptUrl: "", referenceUrl: "", instructions: "Open with the experiment and keep a steady pace.", captions: "Burned-in", editingHours: "2.5" };
describe("channel and project intake", () => {
  it("validates a reusable profile on any secure platform", () => expect(validateCreatorProfile(form(channelValues))).toEqual({ value: channelValues }));
  it.each(["http://tiktok.com/@test", "javascript:alert(1)", "https://user:pass@instagram.com/test"])("rejects unsafe profile URL %s", channelUrl => expect(validateCreatorProfile(form({ ...channelValues, channelUrl })).errors).toHaveProperty("channelUrl"));
  it.each([
    ["TikTok", "https://www.tiktok.com/@test"],
    ["Instagram", "https://www.instagram.com/test"],
    ["My portfolio", "https://example.com/creator"],
  ])("accepts %s creator profiles", (platform, channelUrl) => {
    expect(validateCreatorProfile(form({ ...channelValues, platform, channelUrl })).value).toMatchObject({ platform, channelUrl });
  });
  it("accepts a platform selected from the creator profile dropdown", () => {
    expect(validateCreatorProfile(form({ channelName: "Test creator", platformChoice: "Instagram", channelUrl: channelValues.channelUrl })).value).toMatchObject({ platform: "Instagram" });
  });
  it("accepts a custom platform and requires its name when Other is selected", () => {
    expect(validateCreatorProfile(form({ channelName: "Test creator", platformChoice: "__other__", customPlatform: "Kick", channelUrl: channelValues.channelUrl })).value).toMatchObject({ platform: "Kick" });
    expect(validateCreatorProfile(form({ channelName: "Test creator", platformChoice: "__other__", customPlatform: "", channelUrl: channelValues.channelUrl })).errors).toHaveProperty("platform");
  });
  it("infers common legacy platforms and defaults unknown domains to websites", () => {
    expect(inferCreatorPlatform("https://m.youtube.com/@test")).toBe("YouTube");
    expect(inferCreatorPlatform("https://creator.tiktok.com/@test")).toBe("TikTok");
    expect(inferCreatorPlatform("https://example.com/creator")).toBe("Website");
  });
  it("requires only the creator name and public profile link, inferring a legacy platform", () => {
    expect(validateCreatorProfile(form({ channelName: "Test creator", channelUrl: "https://www.youtube.com/@test" })).value).toMatchObject({ ...channelValues });
    expect(Object.keys(validateCreatorProfile(form({})).errors!)).toEqual(expect.arrayContaining(["channelName", "channelUrl"]));
  });
  it("validates all project requirements and quarter-hour reservations", () => expect(validateProjectBrief(form(briefValues)).value).toMatchObject({ finishedMinutes: 8, rawMinutes: 60, editingMinutes: 150 }));
  it("accepts a platform-neutral online video brief", () => expect(validateProjectBrief(form({ ...briefValues, videoType: "Online video" })).value).toMatchObject({ videoType: "Online video" }));
  it.each(["NaN", "Infinity", "-1", "0", "111", "0.01", "1e2"])("rejects malformed editing hours %s", editingHours => expect(validateProjectBrief(form({ ...briefValues, editingHours })).errors).toHaveProperty("editingHours"));
  it("rejects past and impossible dates", () => {
    expect(validateProjectBrief(form({ ...briefValues, deadline: "2026-02-30" })).errors).toHaveProperty("deadline");
    expect(validateProjectBrief(form({ ...briefValues, deadline: "2020-01-01" })).errors).toHaveProperty("deadline");
  });
  it("rejects unsafe footage and unsupported delivery choices", () => {
    expect(validateProjectBrief(form({ ...briefValues, footageUrl: "http://drive.google.com", resolution: "8K", aspectRatio: "other" })).errors).toMatchObject({ footageUrl: expect.any(String), resolution: expect.any(String), aspectRatio: expect.any(String) });
  });
  it("keeps the creator profile and project brief readable without removed preferences", () => {
    const notes = projectBriefNotes(validateCreatorProfile(form(channelValues)).value!, validateProjectBrief(form(briefValues)).value!);
    expect(notes).toContain(channelValues.channelName); expect(notes).toContain("Creator profile:"); expect(notes).toContain("YouTube ·"); expect(notes).toContain(briefValues.footageUrl); expect(notes).toContain(briefValues.instructions); expect(notes).toContain("2.5 hours");
    expect(notes).not.toContain("Topic:"); expect(notes).not.toContain("Audience:"); expect(notes).not.toContain("Channel style:"); expect(notes).not.toContain("Channel references:");
  });
});
describe("purchased capacity", () => {
  it("keeps hour and video units distinct", () => { expect(purchaseAllowance("creator", "monthly")).toBe(5280); expect(purchaseAllowance("single-creator", "single")).toBe(1); expect(purchaseAllowance("creator", "single")).toBe(0); expect(purchaseAllowance("unrecognized", "monthly")).toBe(0); });
  it("clamps monthly expiration at month end without a rollover", () => {
    expect(purchaseExpiry(new Date("2026-01-31T12:30:00Z"), "monthly")?.toISOString()).toBe("2026-02-28T12:30:00.000Z");
    expect(purchaseExpiry(new Date("2028-01-31T12:30:00Z"), "monthly")?.toISOString()).toBe("2028-02-29T12:30:00.000Z");
    expect(purchaseExpiry(new Date(), "single")).toBeNull();
  });
  it("handles unapplied migrations without masking database permissions", () => {
    expect(isMissingClientWorkspaceSchema({ message: "select creator_profiles", cause: { code: "42P01" } })).toBe(true);
    expect(isMissingClientWorkspaceSchema({ code: "42501", message: "permission denied for creator_profiles" })).toBe(false);
  });
});

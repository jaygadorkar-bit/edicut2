import { isValidWorkspaceDate, parseWorkspaceShareUrl } from "./workspace";

export type CreatorProfile = {
  channelName: string; channelUrl: string; brandUrl: string; platform?: string;
  /** Retained when reading profiles saved before these optional fields were removed. */
  niche?: string; audience?: string; language?: string; cadence?: string; editingStyle?: string; referenceUrl?: string;
};
export type ProjectBrief = {
  title: string; objective: string; videoType: string; finishedMinutes: number; rawMinutes: number;
  aspectRatio: string; resolution: string; deadline: string; footageUrl: string;
  scriptUrl: string; referenceUrl: string; instructions: string; captions: string;
  editingMinutes: number;
};
export type IntakeResult<T> = { value: T; errors?: never } | { errors: Record<string, string>; value?: never };
export const CREATOR_PLATFORM_OPTIONS = [
  "YouTube", "TikTok", "Instagram", "Twitch", "Facebook", "X", "LinkedIn",
  "Podcast", "Spotify", "Vimeo", "Substack", "Patreon", "Website",
] as const;
export const OTHER_CREATOR_PLATFORM = "__other__";
const text = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";

function required(form: FormData, key: string, label: string, errors: Record<string, string>, max = 2000, min = 2) {
  const value = text(form, key);
  if (value.length < min || value.length > max) errors[key] = `${label} must be ${min}–${max} characters.`;
  return value;
}
function link(form: FormData, key: string, errors: Record<string, string>, mandatory = false) {
  const value = text(form, key);
  if ((!value && mandatory) || (value && !parseWorkspaceShareUrl(value))) errors[key] = "Enter a valid HTTPS link without embedded credentials.";
  return value;
}
function option(form: FormData, key: string, choices: readonly string[], errors: Record<string, string>) {
  const value = text(form, key);
  if (!choices.includes(value)) errors[key] = "Choose one of the listed options.";
  return value;
}
export function validateCreatorProfile(form: FormData): IntakeResult<CreatorProfile> {
  const errors: Record<string, string> = {};
  const channelUrl = link(form, "channelUrl", errors, true);
  const selectedPlatform = text(form, "platformChoice");
  const providedPlatform = selectedPlatform === OTHER_CREATOR_PLATFORM
    ? text(form, "customPlatform")
    : selectedPlatform
      ? CREATOR_PLATFORM_OPTIONS.includes(selectedPlatform as typeof CREATOR_PLATFORM_OPTIONS[number])
        ? selectedPlatform
        : ""
      : text(form, "platform");
  if (selectedPlatform && selectedPlatform !== OTHER_CREATOR_PLATFORM && !CREATOR_PLATFORM_OPTIONS.includes(selectedPlatform as typeof CREATOR_PLATFORM_OPTIONS[number])) {
    errors.platform = "Choose a platform from the list.";
  }
  if (selectedPlatform === OTHER_CREATOR_PLATFORM && !providedPlatform) errors.platform = "Enter the platform name.";
  if (providedPlatform.length > 80) errors.platform = "Keep the platform name under 80 characters.";
  const value = {
    channelName: required(form, "channelName", "Creator or brand name", errors, 120),
    platform: providedPlatform || inferCreatorPlatform(channelUrl),
    channelUrl,
    brandUrl: link(form, "brandUrl", errors),
  };
  return Object.keys(errors).length ? { errors } : { value };
}
export function inferCreatorPlatform(urlValue: string) {
  const safeUrl = parseWorkspaceShareUrl(urlValue);
  if (!safeUrl) return "";
  const hostname = new URL(safeUrl).hostname.toLowerCase();
  const platforms: Array<[string, string]> = [
    ["youtube.com", "YouTube"], ["tiktok.com", "TikTok"], ["instagram.com", "Instagram"],
    ["twitch.tv", "Twitch"], ["linkedin.com", "LinkedIn"], ["facebook.com", "Facebook"],
    ["x.com", "X"], ["twitter.com", "X"], ["vimeo.com", "Vimeo"], ["spotify.com", "Spotify"],
    ["substack.com", "Substack"], ["patreon.com", "Patreon"],
  ];
  const match = platforms.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
  return match?.[1] ?? "Website";
}
export function validateProjectBrief(form: FormData, today = new Date().toISOString().slice(0, 10)): IntakeResult<ProjectBrief> {
  const errors: Record<string, string> = {};
  const number = (key: string, max: number) => {
    const raw = text(form, key);
    const value = Number(raw);
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(value) || value <= 0 || value > max) errors[key] = `Enter a number greater than 0 and up to ${max}.`;
    return value;
  };
  const deadline = text(form, "deadline");
  if (!deadline || !isValidWorkspaceDate(deadline) || deadline < today) errors.deadline = "Choose a valid target date today or later.";
  const editingHours = text(form, "editingHours");
  const editingMinutes = editingHours ? Number(editingHours) * 60 : 0;
  if (editingHours && (!/^\d+(?:\.\d{1,2})?$/.test(editingHours) || !Number.isSafeInteger(editingMinutes) || editingMinutes <= 0 || editingMinutes > 6600 || editingMinutes % 15 !== 0)) errors.editingHours = "Reserve editing hours in 0.25-hour increments, up to 110 hours.";
  const value = {
    title: required(form, "title", "Project name", errors, 120, 3),
    objective: required(form, "objective", "Video goal", errors, 2000, 10),
    videoType: option(form, "videoType", ["Online video", "YouTube video", "Podcast", "Tutorial", "Short-form", "Other"], errors),
    finishedMinutes: number("finishedMinutes", 600), rawMinutes: number("rawMinutes", 10000),
    aspectRatio: option(form, "aspectRatio", ["16:9", "9:16", "1:1", "4:5"], errors),
    resolution: option(form, "resolution", ["1080p", "4K"], errors), deadline,
    footageUrl: link(form, "footageUrl", errors, true), scriptUrl: link(form, "scriptUrl", errors),
    referenceUrl: link(form, "referenceUrl", errors),
    instructions: required(form, "instructions", "Editing instructions", errors, 8000, 10),
    captions: option(form, "captions", ["None", "Burned-in", "Subtitle file", "Both"], errors), editingMinutes,
  };
  return Object.keys(errors).length ? { errors } : { value };
}

export function projectBriefNotes(profile: CreatorProfile, brief: ProjectBrief) {
  return [
    `Creator profile: ${profile.channelName} (${profile.platform || inferCreatorPlatform(profile.channelUrl)} · ${profile.channelUrl})`, `Brand assets: ${profile.brandUrl || "None"}`,
    `Goal: ${brief.objective}`, `Format: ${brief.videoType}, ${brief.aspectRatio}, ${brief.resolution}`,
    `Runtime: ${brief.finishedMinutes} minutes; raw footage: ${brief.rawMinutes} minutes`,
    `Target date: ${brief.deadline}`, `Footage: ${brief.footageUrl}`, `Script: ${brief.scriptUrl || "None"}`,
    `Project reference: ${brief.referenceUrl || "None"}`, `Captions: ${brief.captions}`,
    brief.editingMinutes ? `Reserved editing time: ${brief.editingMinutes / 60} hours` : "Uses one purchased video credit",
    `Editing instructions:\n${brief.instructions}`,
  ].join("\n\n");
}

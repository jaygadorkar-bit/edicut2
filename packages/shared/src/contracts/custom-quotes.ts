import { z } from "zod";

export const quoteProjectTypes = { youtube: "YouTube video", podcast: "Podcast", shorts: "Short-form / social", education: "Course / educational", documentary: "Documentary / story", brand: "Brand / commercial", event: "Event / wedding", other: "Something else" } as const;
export const quoteRequestTypes = { single: "One project", recurring: "Ongoing editing" } as const;
export const quotePlatforms = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn", website: "Website / course", other: "Other" } as const;
export const quoteDurations = { under1: "Under 1 minute", "1to5": "1–5 minutes", "5to15": "5–15 minutes", "15to30": "15–30 minutes", "30to60": "30–60 minutes", over60: "Over 60 minutes", unsure: "Help me decide" } as const;
export const quoteFootage = { under30: "Under 30 minutes", "30to60": "30–60 minutes", "1to3h": "1–3 hours", "3to6h": "3–6 hours", over6h: "Over 6 hours", unsure: "Not sure yet" } as const;
export const quoteCadences = { once: "One delivery", weekly: "Every week", fortnightly: "Every two weeks", monthly: "Every month", custom: "Custom schedule" } as const;
export const quoteRatios = { landscape: "Landscape · 16:9", portrait: "Portrait · 9:16", square: "Square · 1:1", other: "Another format" } as const;
export const quoteStyles = { clean: "Clean and focused", energetic: "Fast and energetic", cinematic: "Cinematic", documentary: "Story / documentary", branded: "Match our brand", recommend: "Recommend a style" } as const;
export const quoteServices = { cuts: "Cuts and pacing", captions: "Captions / subtitles", color: "Color correction / grading", audio: "Audio cleanup / mixing", music: "Music and sound design", broll: "B-roll / stock footage", motion: "Branded motion graphics", animation: "Animation / visual effects", multicam: "Multi-camera editing", podcast: "Podcast production", thumbnails: "Custom thumbnails", repurpose: "Short clips from long videos", translations: "Translated subtitles", voiceover: "Voiceover coordination", exports: "Multiple platform versions" } as const;
export const quoteRevisions = { recommend: "Recommend a revision plan", "1": "1 revision round", "2": "2 revision rounds", "3": "3 revision rounds", more: "4 or more rounds" } as const;
export const quoteUrgencies = { flexible: "Flexible timing", standard: "Standard turnaround", rush: "Rush delivery" } as const;
export const quoteBudgets = { discuss: "Discuss the budget", under250: "Under $250", "250to500": "$250–$500", "500to1000": "$500–$1,000", "1000to2500": "$1,000–$2,500", over2500: "$2,500+" } as const;
export const quoteStatuses = { new: "New", reviewing: "Reviewing", contacted: "Contacted", closed: "Closed" } as const;

function choice<T extends Record<string, string>>(options: T) {
  return z.enum(Object.keys(options) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]]);
}

export function isQuoteUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
const optionalUrl = z.string().trim().max(1000, "Use a link under 1,000 characters.").refine(value => !value || isQuoteUrl(value), "Enter an http or https link without credentials.");
const uniqueSelections = <T extends Record<string, string>>(options: T, minimum = 1) => z.array(choice(options)).min(minimum, "Choose at least one option.").max(Object.keys(options).length).refine(values => new Set(values).size === values.length, "Choose each option only once.");

export const customQuoteOptionsSchema = z.object({
  projectType: choice(quoteProjectTypes),
  requestType: choice(quoteRequestTypes),
  platforms: uniqueSelections(quotePlatforms),
  videoCount: z.coerce.number().int("Enter a whole number of videos.").min(1, "Request at least one video.").max(1000, "Request up to 1,000 videos; describe larger volumes in your brief."),
  duration: choice(quoteDurations),
  footage: choice(quoteFootage),
  cadence: choice(quoteCadences),
  aspectRatios: uniqueSelections(quoteRatios),
  style: choice(quoteStyles),
  services: uniqueSelections(quoteServices),
  revisions: choice(quoteRevisions),
  urgency: choice(quoteUrgencies),
  budget: choice(quoteBudgets),
  deadline: z.string().refine(value => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid delivery date."),
  languages: z.string().trim().max(200, "Keep the language details under 200 characters."),
  channelUrl: optionalUrl,
  footageUrl: optionalUrl,
  referenceUrls: z.string().trim().max(2500, "Keep reference links under 2,500 characters.").refine(value => {
    const links = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return links.length <= 5 && links.every(isQuoteUrl);
  }, "Add up to five http or https links, one per line."),
  brief: z.string().trim().min(20, "Tell us about your project in at least 20 characters.").max(6000, "Keep your brief under 6,000 characters."),
});

export const customQuoteInputSchema = customQuoteOptionsSchema.extend({
  requestToken: z.string().uuid("Refresh the page before submitting your request."),
  title: z.string().trim().min(3, "Give your project a name of at least 3 characters.").max(120, "Keep the project name under 120 characters."),
  phone: z.string().trim().max(32, "Use a phone number under 32 characters.").refine(value => !value || (/^[+\d\s().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ""))), "Enter a valid phone number, including country code if outside Bangladesh."),
  preferredContact: z.enum(["email", "whatsapp"]),
}).superRefine((value, context) => {
  if (value.preferredContact === "whatsapp" && !value.phone) context.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Add a phone number so we can contact you on WhatsApp." });
});

export const quoteStatusSchema = choice(quoteStatuses);
export type CustomQuoteOptions = z.infer<typeof customQuoteOptionsSchema>;
export type CustomQuoteInput = z.infer<typeof customQuoteInputSchema>;
export type CustomQuoteStatus = z.infer<typeof quoteStatusSchema>;
export function quoteOptionLabel(options: Record<string, string>, value: string) { return options[value] || value; }

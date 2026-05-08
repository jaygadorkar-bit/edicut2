import { eq } from "drizzle-orm";
import { siteSettings } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";

const PORTFOLIO_SECTIONS_KEY = "portfolio_sections";

export type PortfolioVideo = {
  id: string;
  title: string;
  creatorName: string;
  tag: string;
  uniqueSellingPoint: string;
  videoUrl: string;
  youtubeId: string;
  thumbnailUrl: string;
  orientation: "horizontal" | "vertical";
  sortOrder: number;
};

export type PortfolioSection = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
  videos: PortfolioVideo[];
};

const demoVideos = {
  cinematic: {
    title: "The Ridge",
    creatorName: "Northline Films",
    tag: "YouTube",
    uniqueSellingPoint: "+18% retention",
    videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
    orientation: "horizontal" as const,
  },
  music: {
    title: "Neon Pulse",
    creatorName: "Mira Lane",
    tag: "Music",
    uniqueSellingPoint: "620K views",
    videoUrl: "https://www.youtube.com/watch?v=ScMzIvxBSi4",
    orientation: "vertical" as const,
  },
  commercial: {
    title: "Apex Drive",
    creatorName: "Apex Motors",
    tag: "Commercial",
    uniqueSellingPoint: "1.2M reach",
    videoUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    orientation: "horizontal" as const,
  },
  review: {
    title: "Product Review",
    creatorName: "Tech Table",
    tag: "Review",
    uniqueSellingPoint: "+9% CTR",
    videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    orientation: "horizontal" as const,
  },
  podcast: {
    title: "Founder Interview",
    creatorName: "Build Room",
    tag: "Podcast",
    uniqueSellingPoint: "42 min watch",
    videoUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    orientation: "horizontal" as const,
  },
  podcastClip: {
    title: "Podcast Clips",
    creatorName: "Build Room",
    tag: "Podcast",
    uniqueSellingPoint: "12 clips",
    videoUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    orientation: "vertical" as const,
  },
  gaming: {
    title: "Boss Rush Highlights",
    creatorName: "PixelForge",
    tag: "Gaming",
    uniqueSellingPoint: "71% completion",
    videoUrl: "https://www.youtube.com/watch?v=ScMzIvxBSi4",
    orientation: "vertical" as const,
  },
  beauty: {
    title: "Glow Routine",
    creatorName: "Luma Studio",
    tag: "Health & Beauty",
    uniqueSellingPoint: "330K saves",
    videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
    orientation: "vertical" as const,
  },
};

const sectionDefinitions = [
  { name: "Featured", slug: "featured", videos: [demoVideos.cinematic, demoVideos.music, demoVideos.commercial, demoVideos.review, demoVideos.podcast] },
  { name: "Podcast", slug: "podcast", videos: [demoVideos.podcast, demoVideos.podcastClip, demoVideos.cinematic, demoVideos.review, demoVideos.commercial] },
  { name: "Gaming", slug: "gaming", videos: [demoVideos.cinematic, demoVideos.gaming, demoVideos.review, demoVideos.commercial, demoVideos.podcast] },
  { name: "Commercial", slug: "commercial", videos: [demoVideos.commercial, demoVideos.music, demoVideos.cinematic, demoVideos.review, demoVideos.podcast] },
  { name: "Health and Beauty", slug: "health-and-beauty", videos: [demoVideos.cinematic, demoVideos.beauty, demoVideos.commercial, demoVideos.review, demoVideos.podcast] },
  { name: "Review", slug: "review", videos: [demoVideos.review, demoVideos.beauty, demoVideos.cinematic, demoVideos.commercial, demoVideos.podcast] },
];

export const defaultPortfolioSections: PortfolioSection[] = sectionDefinitions.map((section, sectionIndex) => ({
  id: `portfolio-${section.slug}`,
  name: section.name,
  slug: section.slug,
  active: true,
  sortOrder: sectionIndex + 1,
  videos: section.videos.map((video, videoIndex) => normalizeVideo({
    ...video,
    id: `video-${section.slug}-${videoIndex + 1}`,
    sortOrder: videoIndex + 1,
  }, videoIndex)).filter((video): video is PortfolioVideo => Boolean(video)),
}));

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createPortfolioId(prefix = "portfolio") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function portfolioSlug(value: string, fallback: string) {
  return normalizeSlug(value) || normalizeSlug(fallback) || createPortfolioId("tab");
}

export function youtubeIdFromUrl(value: string) {
  const input = value.trim();
  if (!input) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "").slice(0, 11);
    if (url.searchParams.get("v")) return String(url.searchParams.get("v")).slice(0, 11);
    const embedMatch = url.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
    return embedMatch?.[1] || "";
  } catch {
    return "";
  }

  return "";
}

export function youtubeThumbnailUrl(youtubeId: string) {
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "";
}

function normalizeVideo(value: unknown, index: number): PortfolioVideo | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PortfolioVideo>;
  const title = String(row.title || "").trim();
  const videoUrl = String(row.videoUrl || "").trim();
  const youtubeId = youtubeIdFromUrl(String(row.youtubeId || videoUrl));
  if (!title || !youtubeId) return null;

  return {
    id: String(row.id || createPortfolioId("video")),
    title,
    creatorName: String(row.creatorName || "").trim(),
    tag: String(row.tag || "").trim(),
    uniqueSellingPoint: String(row.uniqueSellingPoint || "").trim(),
    videoUrl: videoUrl || `https://www.youtube.com/watch?v=${youtubeId}`,
    youtubeId,
    thumbnailUrl: String(row.thumbnailUrl || "").trim() || youtubeThumbnailUrl(youtubeId),
    orientation: row.orientation === "vertical" ? "vertical" : "horizontal",
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
  };
}

function normalizeSection(value: unknown, index: number): PortfolioSection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PortfolioSection>;
  const name = String(row.name || "").trim();
  const slug = portfolioSlug(String(row.slug || name), name);
  if (!name || !slug) return null;

  const videos = Array.isArray(row.videos)
    ? row.videos.map(normalizeVideo).filter((video): video is PortfolioVideo => Boolean(video))
    : [];

  return {
    id: String(row.id || slug),
    name,
    slug,
    active: row.active !== false,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
    videos: sortVideos(videos),
  };
}

export function sortVideos(videos: PortfolioVideo[]) {
  return [...videos].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export function sortPortfolioSections(sections: PortfolioSection[]) {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getPortfolioSections(db: DatabaseClient) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, PORTFOLIO_SECTIONS_KEY)).limit(1);

  if (!row?.value) return defaultPortfolioSections;

  try {
    const parsed = JSON.parse(row.value);
    const sections = Array.isArray(parsed)
      ? parsed.map(normalizeSection).filter((section): section is PortfolioSection => Boolean(section))
      : [];

    return sections.length ? sortPortfolioSections(sections) : defaultPortfolioSections;
  } catch {
    return defaultPortfolioSections;
  }
}

export async function savePortfolioSections(db: DatabaseClient, sections: PortfolioSection[]) {
  const now = new Date();
  const value = JSON.stringify(sortPortfolioSections(sections).map((section) => ({
    ...section,
    videos: sortVideos(section.videos),
  })));

  await db
    .insert(siteSettings)
    .values({ key: PORTFOLIO_SECTIONS_KEY, value, updatedAt: now })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: now },
    });
}

export function publicPortfolioSections(sections: PortfolioSection[]) {
  return sortPortfolioSections(sections)
    .filter((section) => section.active)
    .map((section) => ({
      ...section,
      videos: sortVideos(section.videos).slice(0, 5),
    }));
}

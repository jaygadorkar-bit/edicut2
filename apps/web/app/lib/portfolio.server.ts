import type { DatabaseClient } from "@edicut/db/client";
import type { SupabaseRuntimeContext } from "../integrations/supabase/client.server";
import { cloudinaryVideoThumbnailUrl, isCloudinaryVideoUrl } from "./cloudinary";
import { getSiteSetting, saveSiteSetting } from "./site-settings.server";

import { defaultPortfolioSections } from "./portfolio-demo";
export { defaultPortfolioSections } from "./portfolio-demo";

const PORTFOLIO_SECTIONS_KEY = "portfolio_sections";

export type PortfolioVideo = {
  id: string;
  title: string;
  creatorName: string;
  tag: string;
  uniqueSellingPoint: string;
  videoUrl: string;
  youtubeId: string;
  videoProvider: "youtube" | "cloudinary";
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
  const videoProvider = row.videoProvider === "cloudinary" || isCloudinaryVideoUrl(videoUrl) ? "cloudinary" : "youtube";
  if (!title || !videoUrl || (videoProvider === "youtube" && !youtubeId)) return null;

  return {
    id: String(row.id || createPortfolioId("video")),
    title,
    creatorName: String(row.creatorName || "").trim(),
    tag: String(row.tag || "").trim(),
    uniqueSellingPoint: String(row.uniqueSellingPoint || "").trim(),
    videoUrl: videoUrl || `https://www.youtube.com/watch?v=${youtubeId}`,
    youtubeId,
    videoProvider,
    thumbnailUrl: String(row.thumbnailUrl || "").trim() || (videoProvider === "cloudinary" ? cloudinaryVideoThumbnailUrl(videoUrl) : youtubeThumbnailUrl(youtubeId)),
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

export async function getPortfolioSections(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const value = await getSiteSetting(db, PORTFOLIO_SECTIONS_KEY, context);

  if (!value) return defaultPortfolioSections;

  try {
    const parsed = JSON.parse(value);
    const sections = Array.isArray(parsed)
      ? parsed.map(normalizeSection).filter((section): section is PortfolioSection => Boolean(section))
      : [];

    return sections.length ? sortPortfolioSections(sections) : defaultPortfolioSections;
  } catch {
    return defaultPortfolioSections;
  }
}

export async function savePortfolioSections(db: DatabaseClient | null | undefined, sections: PortfolioSection[], context?: SupabaseRuntimeContext) {
  const value = JSON.stringify(sortPortfolioSections(sections).map((section) => ({
    ...section,
    videos: sortVideos(section.videos),
  })));
  await saveSiteSetting(db, PORTFOLIO_SECTIONS_KEY, value, context);
}

export function publicPortfolioSections(sections: PortfolioSection[]) {
  return sortPortfolioSections(sections)
    .filter((section) => section.active)
    .map((section) => ({
      ...section,
      videos: sortVideos(section.videos),
    }));
}

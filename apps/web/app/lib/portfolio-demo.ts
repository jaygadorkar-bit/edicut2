import type { PortfolioSection, PortfolioVideo } from "./portfolio.server";

// Public YouTube references for the demo portfolio, credited to their channels.
// These are samples, not client projects or claimed EdiCut results.
function sample(youtubeId: string, title: string, creatorName: string, tag: string): PortfolioVideo {
  return {
    id: `sample-${youtubeId}`,
    title,
    creatorName,
    tag,
    uniqueSellingPoint: "YouTube sample",
    videoUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtubeId,
    videoProvider: "youtube",
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
    orientation: "horizontal",
    sortOrder: 0,
  };
}

const videos = {
  dji: sample("nbXneZzFh8w", "Meet DJI Mini 4 Pro", "DJI", "Commercial"),
  nike: sample("GbQomqb28os", "You Can't Stop Us", "NIKE JAPAN", "Commercial"),
  ghost: sample("7z7kqwuf0a8", "Ghost of Yōtei — Announce Trailer", "PlayStation", "Gaming"),
  zelda: sample("uHGShqcAHlQ", "Tears of the Kingdom — Official Trailer", "Nintendo of America", "Gaming"),
  tyla: sample("g9DoQlCJ1yQ", "Tyla's Beauty Secrets", "Vogue", "Health & Beauty"),
  kendall: sample("oQkQv1ULyzs", "Kendall Jenner's Spring Makeup", "Vogue", "Health & Beauty"),
  iphone: sample("MRtg6A1f2Ko", "iPhone 16 / 16 Pro Review", "Marques Brownlee", "Review"),
  macbook: sample("Uwmp16aSgdk", "M4 MacBook Air Review", "Marques Brownlee", "Review"),
  metaverse: sample("MVYrJJNdrEg", "First Interview in the Metaverse", "Lex Fridman", "Podcast"),
  rubin: sample("H_szemxPcTI", "Rick Rubin on Music & Creativity", "Lex Fridman", "Podcast"),
  huberman: sample("lvh3g7eszVQ", "Andrew Huberman on Focus & Creativity", "Lex Fridman", "Podcast"),
  altman: sample("L_Guz73e6fw", "Sam Altman on the Future of AI", "Lex Fridman", "Podcast"),
  altmanFollowup: sample("jvqFAi7vkBc", "Sam Altman on Creativity & Technology", "Lex Fridman", "Podcast"),
  bezos: sample("DcWqzZ3I2cY", "Jeff Bezos on Amazon & Blue Origin", "Lex Fridman", "Podcast"),
  godOfWar: sample("EE-4GvjKcfs", "God of War Ragnarök — Reveal Trailer", "PlayStation", "Gaming"),
  spiderMan: sample("9fVYKsEmuRo", "Spider-Man 2 — Launch Trailer", "PlayStation", "Gaming"),
  horizon: sample("UxDWGW7Z67I", "Horizon Forbidden West — Story Trailer", "PlayStation", "Gaming"),
  granTurismo: sample("oz-O74SmTSQ", "Gran Turismo 7 — Announcement Trailer", "PlayStation", "Gaming"),
  air3: sample("xi85DAbv5oU", "Introducing DJI Air 3", "DJI", "Commercial"),
  pocket3: sample("_Bpwo7JlmII", "Introducing DJI Osmo Pocket 3", "DJI", "Commercial"),
  appleAtWork: sample("6K4eUO53-UE", "Apple at Work — Seamless Integration", "Apple", "Commercial"),
  mavic3: sample("r5kukRMmZNI", "Introducing DJI Mavic 3 Pro", "DJI", "Commercial"),
  olivia: sample("CXvG2CBJ3SE", "Olivia Rodrigo's Beauty Routine", "Vogue", "Health & Beauty"),
  rihanna: sample("KONe4SNFA64", "Rihanna's Going-Out Makeup", "Vogue", "Health & Beauty"),
  selena: sample("QF16aIyaSb0", "Selena Gomez's Evening Routine", "Vogue", "Health & Beauty"),
  sabrina: sample("bcA0dGJM5-k", "Sabrina Carpenter's Beauty Secrets", "Vogue", "Health & Beauty"),
  galaxy: sample("a4NJNdHqs_I", "Galaxy S25 Ultra Review", "Marques Brownlee", "Review"),
  macbook16: sample("ctWDAdQ81B8", "16-inch MacBook Pro Review", "Marques Brownlee", "Review"),
  macbookMax: sample("9HQx5pgUoiY", "M4 Max MacBook Pro Review", "Marques Brownlee", "Review"),
  pixel: sample("EGkGRs6YhoM", "Google Pixel 9 / Pro Review", "Marques Brownlee", "Review"),
};

const sections = [
  { name: "Featured", slug: "featured", videos: [videos.dji, videos.tyla, videos.ghost, videos.iphone, videos.rubin, videos.appleAtWork] },
  { name: "Podcast", slug: "podcast", videos: [videos.rubin, videos.metaverse, videos.huberman, videos.altman, videos.bezos, videos.altmanFollowup] },
  { name: "Gaming", slug: "gaming", videos: [videos.ghost, videos.zelda, videos.godOfWar, videos.spiderMan, videos.horizon, videos.granTurismo] },
  { name: "Commercial", slug: "commercial", videos: [videos.dji, videos.nike, videos.air3, videos.pocket3, videos.appleAtWork, videos.mavic3] },
  { name: "Health and Beauty", slug: "health-and-beauty", videos: [videos.tyla, videos.kendall, videos.olivia, videos.rihanna, videos.selena, videos.sabrina] },
  { name: "Review", slug: "review", videos: [videos.iphone, videos.macbook, videos.galaxy, videos.macbook16, videos.macbookMax, videos.pixel] },
];

export const defaultPortfolioSections: PortfolioSection[] = sections.map((section, sectionIndex) => ({
  id: `portfolio-${section.slug}`,
  name: section.name,
  slug: section.slug,
  active: true,
  sortOrder: sectionIndex + 1,
  videos: section.videos.map((video, videoIndex) => ({
    ...video,
    id: `${section.slug}-${video.id}`,
    sortOrder: videoIndex + 1,
  })),
}));

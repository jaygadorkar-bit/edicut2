export type AdminDataRequirements = {
  userDirectory: boolean;
  stats: boolean;
  pricingPackages: boolean;
  siteSettings: boolean;
  roleFeatureAccess: boolean;
  portfolioSections: boolean;
  images: boolean;
  imageUsage: boolean;
  videos: boolean;
  videoUsage: boolean;
};

/** Keep the admin loader's database and Cloudinary work scoped to the active view. */
export function getAdminDataRequirements(tab: string): AdminDataRequirements {
  const isOverview = tab === "overview";
  const isUsers = tab === "users";
  const isImages = tab === "images";
  const isVideos = tab === "videos";

  return {
    userDirectory: isUsers,
    stats: isOverview || isUsers,
    pricingPackages: isOverview || tab === "packages",
    siteSettings: tab === "settings",
    roleFeatureAccess: tab === "roles",
    portfolioSections: isVideos,
    images: isOverview || isImages,
    imageUsage: isImages,
    videos: isVideos,
    videoUsage: isVideos,
  };
}

export function getPositivePage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function getPageWithinRange(requestedPage: number, pageCount: number) {
  const lastPage = Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return Math.min(page, lastPage);
}

export const MARKETING_ASSET_CATEGORIES = ["logo", "banner", "post", "story-reel", "thumbnail", "other"] as const;
export type MarketingAssetCategory = (typeof MARKETING_ASSET_CATEGORIES)[number];

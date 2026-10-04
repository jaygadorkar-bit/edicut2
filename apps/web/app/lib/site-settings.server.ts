import { inArray } from "drizzle-orm";
import { siteSettings } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";
import {
  getSupabaseAdmin,
  getSupabaseClient,
  type SupabaseRuntimeContext,
} from "../integrations/supabase/client.server";
import {
  DEFAULT_ROLE_FEATURE_ACCESS,
  sanitizeRoleFeatureAccess,
  type RoleFeatureAccess,
} from "./role-feature-access";

const ADMIN_TOOLBAR_ENABLED_KEY = "admin_toolbar_enabled";
const PROMO_BAR_ENABLED_KEY = "promo_bar_enabled";
const PROMO_BAR_MESSAGE_KEY = "promo_bar_message";
const ROLE_FEATURE_ACCESS_KEY = "role_feature_access";
const SEARCH_CRAWLING_ENABLED_KEY = "search_crawling_enabled";
const MAINTENANCE_MODE_ENABLED_KEY = "maintenance_mode_enabled";
const DEFAULT_PROMO_BAR_MESSAGE = "Welcome to EdiCut! Black Friday Special: 20% off all packages.";
type SiteSettingsReadOptions = { failOnError?: boolean };

export type SiteSettingsSnapshot = {
  adminToolbarEnabled: boolean;
  searchCrawlingEnabled: boolean;
  maintenanceModeEnabled: boolean;
  promoBarSettings: { enabled: boolean; message: string };
};

export async function getSiteSettings(
  db: DatabaseClient | null | undefined,
  keys: string[],
  context?: SupabaseRuntimeContext,
  options: SiteSettingsReadOptions = {},
): Promise<Record<string, string | undefined>> {
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return {};

  const supabase = getSupabaseClient(context);
  if (supabase) {
    let admin;
    try {
      admin = getSupabaseAdmin(context);
    } catch (error) {
      console.error("Supabase site settings read failed: server-side credentials are unavailable.", error);
      if (options.failOnError) throw error;
      return {};
    }
    const { data, error } = await admin
      .from("site_settings")
      .select("key, value")
      .in("key", uniqueKeys);

    if (!error) return Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? undefined]));
    console.error(`Supabase site settings read failed for ${uniqueKeys.join(", ")}:`, error.message);
    if (options.failOnError) throw error;
    return {};
  }

  if (!db) return {};
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, uniqueKeys));
  return Object.fromEntries(rows.map((row) => [row.key, row.value ?? undefined]));
}

export async function getSiteSettingsSnapshot(
  db: DatabaseClient | null | undefined,
  context?: SupabaseRuntimeContext,
  options: { includeAdminToolbar?: boolean; includePromoBar?: boolean } = {},
): Promise<SiteSettingsSnapshot> {
  const keys = [
    ...(options.includeAdminToolbar ? [ADMIN_TOOLBAR_ENABLED_KEY] : []),
    SEARCH_CRAWLING_ENABLED_KEY,
    MAINTENANCE_MODE_ENABLED_KEY,
    ...(options.includePromoBar ? [PROMO_BAR_ENABLED_KEY, PROMO_BAR_MESSAGE_KEY] : []),
  ];
  const values = await getSiteSettings(db, keys, context);

  return {
    adminToolbarEnabled: options.includeAdminToolbar === true && values[ADMIN_TOOLBAR_ENABLED_KEY] !== "false",
    searchCrawlingEnabled: values[SEARCH_CRAWLING_ENABLED_KEY] !== "false",
    maintenanceModeEnabled: values[MAINTENANCE_MODE_ENABLED_KEY] === "true",
    promoBarSettings: options.includePromoBar
      ? {
          enabled: values[PROMO_BAR_ENABLED_KEY] === "true",
          message: values[PROMO_BAR_MESSAGE_KEY] || DEFAULT_PROMO_BAR_MESSAGE,
        }
      : { enabled: false, message: "" },
  };
}

export async function getSiteSetting(
  db: DatabaseClient | null | undefined,
  key: string,
  context?: SupabaseRuntimeContext,
  options: SiteSettingsReadOptions = {},
) {
  const values = await getSiteSettings(db, [key], context, options);
  return values[key];
}

export async function saveSiteSetting(
  db: DatabaseClient | null | undefined,
  key: string,
  value: string,
  context?: SupabaseRuntimeContext,
) {
  const supabase = getSupabaseClient(context);
  if (supabase) {
    const admin = getSupabaseAdmin(context);
    const { error } = await admin.from("site_settings").upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw error;
    return;
  }

  if (!db) throw new Error("A database client is required to save site settings.");
  const now = new Date();

  await db
    .insert(siteSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: now },
    });
}

async function getSetting(db: DatabaseClient | null | undefined, key: string, context?: SupabaseRuntimeContext) {
  return getSiteSetting(db, key, context);
}

async function saveSetting(
  db: DatabaseClient | null | undefined,
  key: string,
  value: string,
  context?: SupabaseRuntimeContext,
) {
  return saveSiteSetting(db, key, value, context);
}

export async function getAdminToolbarEnabled(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const value = await getSetting(db, ADMIN_TOOLBAR_ENABLED_KEY, context);
  return value !== "false";
}

export async function saveAdminToolbarEnabled(db: DatabaseClient | null | undefined, enabled: boolean, context?: SupabaseRuntimeContext) {
  await saveSetting(db, ADMIN_TOOLBAR_ENABLED_KEY, enabled ? "true" : "false", context);
}

export async function getSearchCrawlingEnabled(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const value = await getSetting(db, SEARCH_CRAWLING_ENABLED_KEY, context);
  return value !== "false";
}

export async function saveSearchCrawlingEnabled(db: DatabaseClient | null | undefined, enabled: boolean, context?: SupabaseRuntimeContext) {
  await saveSetting(db, SEARCH_CRAWLING_ENABLED_KEY, enabled ? "true" : "false", context);
}

export async function getMaintenanceModeEnabled(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const value = await getSetting(db, MAINTENANCE_MODE_ENABLED_KEY, context);
  return value === "true";
}

export async function saveMaintenanceModeEnabled(db: DatabaseClient | null | undefined, enabled: boolean, context?: SupabaseRuntimeContext) {
  await saveSetting(db, MAINTENANCE_MODE_ENABLED_KEY, enabled ? "true" : "false", context);
}

export async function getPromoBarSettings(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const values = await getSiteSettings(db, [PROMO_BAR_ENABLED_KEY, PROMO_BAR_MESSAGE_KEY], context);
  return {
    enabled: values[PROMO_BAR_ENABLED_KEY] === "true",
    message: values[PROMO_BAR_MESSAGE_KEY] || DEFAULT_PROMO_BAR_MESSAGE,
  };
}

export async function savePromoBarSettings(db: DatabaseClient | null | undefined, enabled: boolean, message: string, context?: SupabaseRuntimeContext) {
  await saveSetting(db, PROMO_BAR_ENABLED_KEY, enabled ? "true" : "false", context);
  await saveSetting(db, PROMO_BAR_MESSAGE_KEY, message || "", context);
}

export async function getRoleFeatureAccessSettings(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext): Promise<RoleFeatureAccess> {
  const value = await getSetting(db, ROLE_FEATURE_ACCESS_KEY, context);

  if (!value) {
    return DEFAULT_ROLE_FEATURE_ACCESS;
  }

  try {
    return sanitizeRoleFeatureAccess(JSON.parse(value));
  } catch {
    return DEFAULT_ROLE_FEATURE_ACCESS;
  }
}

export async function saveRoleFeatureAccessSettings(db: DatabaseClient | null | undefined, access: RoleFeatureAccess, context?: SupabaseRuntimeContext) {
  await saveSetting(db, ROLE_FEATURE_ACCESS_KEY, JSON.stringify(sanitizeRoleFeatureAccess(access)), context);
}

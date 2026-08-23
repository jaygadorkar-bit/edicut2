import { eq } from "drizzle-orm";
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

export async function getSiteSetting(
  db: DatabaseClient | null | undefined,
  key: string,
  context?: SupabaseRuntimeContext,
) {
  const supabase = getSupabaseClient(context);
  if (supabase) {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (!error) return data?.value;
    console.error(`Supabase site setting read failed for ${key}:`, error.message);
    return undefined;
  }

  if (!db) return undefined;
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return row?.value;
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

export async function getPromoBarSettings(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const enabledStr = await getSetting(db, PROMO_BAR_ENABLED_KEY, context);
  const message = await getSetting(db, PROMO_BAR_MESSAGE_KEY, context);
  return {
    enabled: enabledStr === "true",
    message: message || "Welcome to EdiCut! Black Friday Special: 20% off all packages.",
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

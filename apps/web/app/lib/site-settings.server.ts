import { eq } from "drizzle-orm";
import { siteSettings } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";

const ADMIN_TOOLBAR_ENABLED_KEY = "admin_toolbar_enabled";
const PROMO_BAR_ENABLED_KEY = "promo_bar_enabled";
const PROMO_BAR_MESSAGE_KEY = "promo_bar_message";

async function getSetting(db: DatabaseClient, key: string) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return row?.value;
}

async function saveSetting(db: DatabaseClient, key: string, value: string) {
  const now = new Date();

  await db
    .insert(siteSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: now },
    });
}

export async function getAdminToolbarEnabled(db: DatabaseClient) {
  const value = await getSetting(db, ADMIN_TOOLBAR_ENABLED_KEY);
  return value !== "false";
}

export async function saveAdminToolbarEnabled(db: DatabaseClient, enabled: boolean) {
  await saveSetting(db, ADMIN_TOOLBAR_ENABLED_KEY, enabled ? "true" : "false");
}

export async function getPromoBarSettings(db: DatabaseClient) {
  const enabledStr = await getSetting(db, PROMO_BAR_ENABLED_KEY);
  const message = await getSetting(db, PROMO_BAR_MESSAGE_KEY);
  return {
    enabled: enabledStr === "true",
    message: message || "Welcome to EdiCut! Black Friday Special: 20% off all packages.",
  };
}

export async function savePromoBarSettings(db: DatabaseClient, enabled: boolean, message: string) {
  await saveSetting(db, PROMO_BAR_ENABLED_KEY, enabled ? "true" : "false");
  await saveSetting(db, PROMO_BAR_MESSAGE_KEY, message || "");
}

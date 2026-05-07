import { eq } from "drizzle-orm";
import { siteSettings } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";

const ADMIN_TOOLBAR_ENABLED_KEY = "admin_toolbar_enabled";

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

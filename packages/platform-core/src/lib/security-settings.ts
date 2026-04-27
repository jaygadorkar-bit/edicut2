import { db } from "../db";
import { systemSettings } from "../db/schema";
import { eq } from "drizzle-orm";

export type SecuritySettings = {
  recaptcha_enabled: boolean;
  registration_locked: boolean;
  strict_password_policy: boolean;
  account_lockout_enabled: boolean;
  rate_limiting_enabled: boolean;
  signup_otp_enabled: boolean;
};

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const allSettings = await db.select().from(systemSettings);
  const settingsMap: Record<string, unknown> = {};

  allSettings.forEach((setting: { key: string; value: unknown }) => {
    settingsMap[setting.key] = setting.value;
  });

  return {
    recaptcha_enabled: (settingsMap.recaptcha_enabled as boolean | undefined) ?? true,
    registration_locked: (settingsMap.registration_locked as boolean | undefined) ?? false,
    strict_password_policy: (settingsMap.strict_password_policy as boolean | undefined) ?? false,
    account_lockout_enabled:
      (settingsMap.account_lockout_enabled as boolean | undefined) ?? true,
    rate_limiting_enabled: (settingsMap.rate_limiting_enabled as boolean | undefined) ?? true,
    signup_otp_enabled: (settingsMap.signup_otp_enabled as boolean | undefined) ?? false,
  };
}

export async function updateSecuritySetting(key: string, value: unknown) {
  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({
      key,
      value,
    });
  }
}

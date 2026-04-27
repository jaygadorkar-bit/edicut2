"use server";

import {
  getSecuritySettings as getSharedSecuritySettings,
  updateSecuritySetting as updateSharedSecuritySetting,
} from "@edicut/platform-core/lib/security-settings";

export async function getSecuritySettings() {
  try {
    return await getSharedSecuritySettings();
  } catch (error) {
    console.error("Error fetching security settings:", error);
    return {
      recaptcha_enabled: true,
      registration_locked: false,
      strict_password_policy: false,
      account_lockout_enabled: true,
      rate_limiting_enabled: true,
      signup_otp_enabled: false,
    };
  }
}

export async function updateSecuritySetting(key: string, value: unknown) {
  try {
    await updateSharedSecuritySetting(key, value);
    return { success: true as const };
  } catch (error) {
    console.error(`Error updating security setting ${key}:`, error);
    return { success: false as const, error: "Failed to update security setting." };
  }
}


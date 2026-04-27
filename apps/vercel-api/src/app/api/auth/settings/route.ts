import { NextResponse } from "next/server";
import { getSecuritySettings } from "@edicut/platform-core/lib/security-settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getSecuritySettings();

    return NextResponse.json({
      recaptcha_enabled: settings.recaptcha_enabled,
      signup_otp_enabled: settings.signup_otp_enabled,
    });
  } catch (error) {
    console.error("Failed to load public auth settings:", error);

    return NextResponse.json({
      recaptcha_enabled: true,
      signup_otp_enabled: false,
    });
  }
}

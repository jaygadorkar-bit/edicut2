export const runtime = "edge";

import { auth } from "@edicut/platform-core/auth-edge";
import { redirect } from "next/navigation";
import { fetchServerApi } from "@/lib/api/server";

import { LoginForm } from "./login-form";

async function getAuthSettings() {
  return fetchServerApi<{
    recaptcha_enabled: boolean;
    signup_otp_enabled: boolean;
  }>("/api/auth/settings");
}

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const settings = await getAuthSettings().catch((error) => {
    console.error("Failed to fetch auth settings for login page:", error);

    return {
      recaptcha_enabled: true,
      signup_otp_enabled: false,
    };
  });

  const recaptchaConfigured = Boolean(
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY
  );
  const recaptchaEnabled =
    settings.recaptcha_enabled && recaptchaConfigured;
  const signupOtpEnabled = settings.signup_otp_enabled;

  return (
    <LoginForm
      recaptchaEnabled={recaptchaEnabled}
      signupOtpEnabled={signupOtpEnabled}
    />
  );
}



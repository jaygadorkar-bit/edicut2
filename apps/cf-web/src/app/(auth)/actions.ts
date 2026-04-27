"use server";

import { headers } from "next/headers";
import {
  getClientIp,
  requestPasswordResetAction,
  requestSignupOtpAction,
  resetPasswordAction,
  signUpWithCredentialsAction,
  verifyCaptchaToken,
  verifySignupOtpAction,
  type AuthActionResult,
  type ErrorResult,
} from "@edicut/platform-core/lib/auth-flows";

function readFormValue(formData: FormData, key: string) {
  return (formData.get(key) as string | null) || "";
}

async function getRequestIp() {
  const headerList = await headers();
  return getClientIp(headerList.get("x-forwarded-for"));
}

export function verifyCaptcha(token: string | null): Promise<{ success: true } | ErrorResult> {
  return verifyCaptchaToken(token);
}

export async function requestSignupOtp(formData: FormData): Promise<AuthActionResult> {
  return requestSignupOtpAction(
    {
      name: readFormValue(formData, "name"),
      email: readFormValue(formData, "email"),
      password: readFormValue(formData, "password"),
    },
    await getRequestIp()
  );
}

export async function verifySignupOtp(formData: FormData): Promise<AuthActionResult> {
  return verifySignupOtpAction(
    {
      email: readFormValue(formData, "email"),
      password: readFormValue(formData, "password"),
      otp: readFormValue(formData, "otp"),
    },
    await getRequestIp()
  );
}

export async function signUpWithCredentials(formData: FormData): Promise<AuthActionResult> {
  return signUpWithCredentialsAction(
    {
      name: readFormValue(formData, "name"),
      email: readFormValue(formData, "email"),
      password: readFormValue(formData, "password"),
    },
    await getRequestIp()
  );
}

export async function requestPasswordReset(formData: FormData): Promise<AuthActionResult> {
  return requestPasswordResetAction({
    email: readFormValue(formData, "email"),
  });
}

export async function resetPassword(formData: FormData): Promise<AuthActionResult> {
  return resetPasswordAction({
    token: readFormValue(formData, "token"),
    password: readFormValue(formData, "password"),
  });
}


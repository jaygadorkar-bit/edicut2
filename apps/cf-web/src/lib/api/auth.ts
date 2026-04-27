import { fetchApi } from "@/lib/api/client";
import type { AuthActionResult, ErrorResult } from "@edicut/platform-core/lib/auth-flows";

type CaptchaResult = { success: true } | ErrorResult;

export function verifyCaptcha(token: string | null) {
  return fetchApi<CaptchaResult>("/api/auth/captcha", {
    method: "POST",
    body: { token },
  });
}

export function requestSignupOtp(input: { name: string; email: string; password: string }) {
  return fetchApi<AuthActionResult>("/api/auth/signup/otp", {
    method: "POST",
    body: input,
  });
}

export function verifySignupOtp(input: { email: string; password: string; otp: string }) {
  return fetchApi<AuthActionResult>("/api/auth/signup/otp/verify", {
    method: "POST",
    body: input,
  });
}

export function signUpWithCredentials(input: { name: string; email: string; password: string }) {
  return fetchApi<AuthActionResult>("/api/auth/signup", {
    method: "POST",
    body: input,
  });
}

export function requestPasswordReset(input: { email: string }) {
  return fetchApi<AuthActionResult>("/api/auth/password-reset/request", {
    method: "POST",
    body: input,
  });
}

export function resetPassword(input: { token: string; password: string }) {
  return fetchApi<AuthActionResult>("/api/auth/password-reset", {
    method: "POST",
    body: input,
  });
}


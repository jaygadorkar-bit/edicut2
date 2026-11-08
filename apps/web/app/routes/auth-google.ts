import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { startGoogleOAuth } from "../lib/google-auth.server";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { isLocalDevelopmentHostname } from "../lib/recaptcha.shared";
import { requestBodyExceedsLimit } from "../lib/usage-protection.server";
import type { LoaderContext } from "../types";
import { readMutationForm } from "../lib/mutation-request.server";
import { safeRedirectPath } from "../lib/safe-redirect";
import { issueAuthCsrfToken, verifyAuthCsrfToken } from "../lib/session.server";

// Bookmarks, refreshes and GET navigations must return to the sign-in form.
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const destination = new URL(url.searchParams.get("mode") === "admin" ? ADMIN_LOGIN_PATH : "/signin", url);
  const returnTo = url.searchParams.get("returnTo");
  const returnPath = safeRedirectPath(returnTo, "");
  if (returnPath) destination.searchParams.set("redirectTo", returnPath);
  return redirect(`${destination.pathname}${destination.search}`, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (requestBodyExceedsLimit(request, 16 * 1024)) {
    return new Response("Sign-in request is too large.", { status: 413 });
  }

  const formData = await readMutationForm(request, 16 * 1024);
  if (!formData) return new Response("Sign-in form could not be read.", { status: 400 });
  const mode = formData.get("mode") === "admin" ? "admin" : "user";

  if (!await verifyAuthCsrfToken(request, formData.get("csrfToken"), context)) {
    const csrf = await issueAuthCsrfToken(request, context);
    const destination = new URL(mode === "admin" ? ADMIN_LOGIN_PATH : "/signin", request.url);
    destination.searchParams.set("error", "auth-request");
    const returnPath = safeRedirectPath(formData.get("returnTo"), "");
    if (returnPath) destination.searchParams.set("redirectTo", returnPath);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);
    return redirect(`${destination.pathname}${destination.search}`, { headers });
  }

  if (mode === "admin") {
    const captcha = isLocalDevelopmentHostname(new URL(request.url).hostname)
      ? { success: true as const }
      : await verifyRecaptchaToken({
          context,
          token: formData.get("g-recaptcha-response"),
        });

    if (!captcha.success) {
      const destination = new URL(ADMIN_LOGIN_PATH, request.url);
      destination.searchParams.set("error", "recaptcha");
      const returnPath = safeRedirectPath(formData.get("returnTo"), "");
      if (returnPath) destination.searchParams.set("redirectTo", returnPath);
      return redirect(`${destination.pathname}${destination.search}`);
    }
  }

  // User OAuth stays same-site protected and rate-limited without the flaky extra CAPTCHA gate.
  return startGoogleOAuth(request, context as LoaderContext, formData);
}

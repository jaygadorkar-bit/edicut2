import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { startGoogleOAuth } from "../lib/google-auth.server";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { isSameSiteMutation } from "../lib/customer-subscriptions.server";
import { requestBodyExceedsLimit } from "../lib/usage-protection.server";
import type { LoaderContext } from "../types";

export async function action({ request, context }: ActionFunctionArgs) {
  if (requestBodyExceedsLimit(request, 16 * 1024)) {
    return new Response("Sign-in request is too large.", { status: 413 });
  }

  if (!isSameSiteMutation(request)) {
    return new Response("Please start sign-in from this site.", { status: 403 });
  }

  const formData = await request.clone().formData();
  const mode = formData.get("mode") === "admin" ? "admin" : "user";
  const captcha = await verifyRecaptchaToken({ context, token: formData.get("g-recaptcha-response") });

  if (!captcha.success) {
    const destination = new URL(mode === "admin" ? ADMIN_LOGIN_PATH : "/signin", request.url);
    destination.searchParams.set("error", "recaptcha");
    const returnTo = formData.get("returnTo");
    if (typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      destination.searchParams.set("redirectTo", returnTo);
    }
    return redirect(`${destination.pathname}${destination.search}`);
  }

  return startGoogleOAuth(request, context as LoaderContext);
}

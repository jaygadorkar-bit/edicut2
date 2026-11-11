import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { startGoogleOAuth } from "../lib/google-auth.server";
import { safeAdminRedirect } from "../lib/safe-redirect";
import { isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { verifyAuthCsrfToken } from "../lib/session.server";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import type { LoaderContext } from "../types";

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function redirectToAdminLogin(request: Request, error: "auth-request" | "google-unavailable", returnTo: string) {
  const destination = new URL(ADMIN_LOGIN_PATH, request.url);
  destination.searchParams.set("error", error);
  destination.searchParams.set("redirectTo", safeAdminRedirect(returnTo));
  return redirect(destination.href, { status: 303, headers: privateHeaders });
}

export function loader({ request }: LoaderFunctionArgs) {
  return redirect(new URL(ADMIN_LOGIN_PATH, request.url).href, { status: 303, headers: privateHeaders });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) {
    return new Response("Invalid sign-in request.", { status: 403, headers: privateHeaders });
  }

  const submitted = await readMutationForm(request, 4096);
  if (!submitted) {
    return new Response("Invalid sign-in request.", { status: 400, headers: privateHeaders });
  }

  const returnTo = safeAdminRedirect(submitted.get("returnTo"));
  const typedContext = context as LoaderContext;
  if (!await verifyAuthCsrfToken(request, submitted.get("csrfToken"), typedContext)) {
    return redirectToAdminLogin(request, "auth-request", returnTo);
  }

  // The mode is fixed here; browsers cannot turn the public sign-in endpoint
  // into an admin flow. The OAuth callback still requires an active admin row.
  const form = new FormData();
  form.set("mode", "admin");
  form.set("returnTo", returnTo);

  try {
    return await startGoogleOAuth(request, typedContext, form);
  } catch (error) {
    console.error("Admin Google sign-in could not start.", {
      type: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof Response ? error.status : 500,
    });
    return redirectToAdminLogin(request, "google-unavailable", returnTo);
  }
}

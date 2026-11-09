import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { startGoogleOAuth } from "../lib/google-auth.server";
import { isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import type { LoaderContext } from "../types";

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL("/signin?error=google-unavailable", request.url);
  return redirect(url.href, { status: 303, headers: privateHeaders });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST" || !isSameSiteMutation(request)) {
    return new Response("Invalid sign-in request.", { status: 403, headers: privateHeaders });
  }

  const submitted = await readMutationForm(request, 4096);
  if (!submitted) {
    return new Response("Invalid sign-in request.", { status: 400, headers: privateHeaders });
  }

  // Never let a browser choose the elevated admin OAuth mode.
  const form = new FormData();
  form.set("mode", "user");
  form.set("returnTo", typeof submitted.get("returnTo") === "string" ? String(submitted.get("returnTo")) : "/dashboard");
  try {
    return await startGoogleOAuth(request, context as LoaderContext, form);
  } catch (error) {
    console.error("Google sign-in could not start.", {
      type: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof Response ? error.status : 500,
    });
    return redirect(new URL("/signin?error=google-unavailable", request.url).href, { status: 303, headers: privateHeaders });
  }
}

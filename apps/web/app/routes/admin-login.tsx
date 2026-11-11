import { safeAdminRedirect } from "../lib/safe-redirect";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData, useSearchParams } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import {
  getAdminSession,
  issueAuthCsrfToken,
  requireAdminUser,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_GOOGLE_LOGIN_PATH } from "../lib/admin-paths";

const adminLoginErrors: Record<string, string> = {
  "auth-request": "Your sign-in request expired. Please try again.",
  "google-unavailable": "Google sign-in could not be completed. Please start a new sign-in attempt.",
  "google-state": "Google sign-in expired or could not be verified. Please try again.",
  "google-cancelled": "Google sign-in was cancelled. You can try again.",
  "google-email": "Google could not verify this account’s email address.",
  "account-unavailable": "Admin access is not available for this account.",
};

export const meta: MetaFunction = () => {
  return [
    { title: "Admin sign in - EdiCut" },
    { name: "robots", content: "noindex,nofollow" },
  ];
};

export function headers({ loaderHeaders, actionHeaders }: { loaderHeaders: Headers; actionHeaders: Headers }) {
  const headers = new Headers(actionHeaders.has("Set-Cookie") ? actionHeaders : loaderHeaders);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "same-origin");
  return headers;
}

function safeRedirectTo(value: unknown) {
  return safeAdminRedirect(value);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const csrf = await issueAuthCsrfToken(request, context);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);

  const session = await getAdminSession(request.headers.get("Cookie"), context);

  if (session.has("adminUserId")) {
    await requireAdminUser(request, getDbFromContext(context), context, ADMIN_BASE_PATH);
    throw redirect(ADMIN_BASE_PATH);
  }

  return data({ csrfToken: csrf.token }, { headers });
}

export default function AdminLoginRoute() {
  const { csrfToken } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirectTo"));
  const errorCode = searchParams.get("error") ?? "";
  const errorMessage = adminLoginErrors[errorCode];

  return (
    <main className="min-h-screen bg-[#F6F7F8] px-5 py-8 text-foreground sm:px-6">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1fr]">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-black shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-white">
              <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
            </span>
            EdiCut Admin
          </div>
          <h1 className="mt-8 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
            Operations access for trusted staff only.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#575757]">
            Admin sessions are separate from client dashboard sessions and expire faster.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Scoped cookie", "Admin-only path"],
              ["Role gate", "Server verified"],
              ["Short session", "2 hour window"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase text-muted-foreground">{label}</p>
                <p className="mt-2 text-sm font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Secure area</p>
              <h2 className="mt-1 text-2xl font-black">Admin sign in</h2>
            </div>
            <span className="material-symbols-outlined text-primary" aria-hidden="true">lock</span>
          </div>

          {errorMessage ? (
            <div role="alert" className="mt-5 rounded-lg border border-red-100 bg-[#FFF5F5] p-3 text-sm font-bold text-[#D90000]">
              {errorMessage}
            </div>
          ) : null}

          <form method="post" action={ADMIN_GOOGLE_LOGIN_PATH} className="mt-6">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="returnTo" value={redirectTo} />
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-5 text-sm font-bold text-foreground shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <img src="/icons/google-g.png" alt="" width="20" height="20" aria-hidden="true" />
              Continue with Google
            </button>
          </form>
          <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
            Use the Google account assigned an active EdiCut admin role.
          </p>
        </section>
      </section>
    </main>
  );
}

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { Form, redirect, useActionData, useNavigation, useSearchParams, useSubmit } from "react-router";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import { getDbFromContext } from "../lib/db.server";
import {
  createAdminSession,
  getAdminSession,
  destroyAdminSession,
  requireAdminUser,
  isAdminRole,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyPassword } from "../lib/password.server";
import { executeInvisibleRecaptcha } from "../lib/recaptcha.client";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import {
  signInWithSupabase,
  supabaseAuthEnabled,
} from "../integrations/supabase/auth.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPT_KEYS = 10_000;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __edicutAdminLoginAttempts: Map<string, LoginAttempt> | undefined;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Admin sign in - EdiCut" },
    { name: "robots", content: "noindex,nofollow" },
  ];
};

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "same-origin",
  };
}

function safeRedirectTo(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || !value.startsWith(ADMIN_BASE_PATH)) {
    return ADMIN_BASE_PATH;
  }

  if (value.startsWith(ADMIN_LOGIN_PATH) || value.includes("//")) {
    return ADMIN_BASE_PATH;
  }

  return value;
}

function getAttemptStore() {
  return (globalThis.__edicutAdminLoginAttempts ??= new Map());
}

function getClientIp(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function getAttemptKey(request: Request, email: string) {
  return `${getClientIp(request)}:${email}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const store = getAttemptStore();
  const attempt = store.get(key);

  if (!attempt && store.size >= MAX_ATTEMPT_KEYS) {
    pruneExpiredAttempts(store, now);
    if (store.size >= MAX_ATTEMPT_KEYS) return true;
  }

  if (!attempt) {
    return false;
  }

  if (attempt.resetAt <= now) {
    getAttemptStore().delete(key);
    return false;
  }

  return attempt.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const store = getAttemptStore();
  const attempt = store.get(key);

  if (!attempt || attempt.resetAt <= now) {
    pruneExpiredAttempts(store, now);
    if (!store.has(key) && store.size >= MAX_ATTEMPT_KEYS) return;
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempt.count += 1;
}

function clearFailedAttempts(key: string) {
  getAttemptStore().delete(key);
}

function pruneExpiredAttempts(store: Map<string, LoginAttempt>, now: number) {
  for (const [key, attempt] of store) {
    if (attempt.resetAt <= now) store.delete(key);
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await getAdminSession(request.headers.get("Cookie"), context);

  if (session.has("adminUserId")) {
    try {
      await requireAdminUser(request, getDbFromContext(context), context);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 302) throw error;
      throw redirect("/signin?redirectTo=%2Fdashboard", {
        headers: { "Set-Cookie": await destroyAdminSession(session, context) },
      });
    }
    throw redirect(ADMIN_BASE_PATH);
  }

  throw redirect("/signin?redirectTo=%2Fdashboard");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) {
    return { error: "Admin request origin was rejected." };
  }

  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Admin sign-in request is too large. Please try again." };
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Admin sign-in request could not be read. Please try again." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));

  if (!email || email.length > 254 || !password || password.length < 6 || password.length > 1024) {
    return { error: "Use your admin email and password." };
  }

  const identityKey = await hashUsageLimitKey(email);
  const authLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "AUTH_IDENTITY_LIMITER",
    key: identityKey,
    localLimit: 5,
    localPeriodSeconds: 60,
  });
  if (authLimit !== "allowed") {
    return {
      error: authLimit === "limited"
        ? "Too many attempts for this account. Wait a minute and try again."
        : "Sign-in protection is temporarily unavailable. Please try again shortly.",
    };
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return { error: captcha.error };
  }

  const attemptKey = getAttemptKey(request, email);

  if (isRateLimited(attemptKey)) {
    return { error: "Too many attempts. Try again later." };
  }

  const db = getDbFromContext(context);
  const user = await findAdminUserByEmail(db, email);

  if (supabaseAuthEnabled(context)) {
    if (!user || !user.active || !isAdminRole(user.role)) {
      recordFailedAttempt(attemptKey);
      return { error: "Admin access is not available for this account." };
    }

    const result = await signInWithSupabase({ context, email, password });
    if (!result.error && result.user && result.session) {
      clearFailedAttempts(attemptKey);
      return createAdminSession({
        request,
        context,
        userId: user.id,
        redirectTo,
        accessToken: result.session.access_token,
        refreshToken: result.session.refresh_token,
      });
    }

    if (user.passwordHash && await verifyPassword(password, user.passwordHash)) {
      clearFailedAttempts(attemptKey);
      return createAdminSession({ request, context, userId: user.id, redirectTo });
    }

    recordFailedAttempt(attemptKey);
    return { error: "Admin access is not available for this account." };
  }

  if (!user || !user.active || !isAdminRole(user.role) || !user.passwordHash) {
    recordFailedAttempt(attemptKey);
    return { error: "Admin access is not available for this account." };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    recordFailedAttempt(attemptKey);
    return { error: "Admin access is not available for this account." };
  }

  clearFailedAttempts(attemptKey);

  return createAdminSession({ request, context, userId: user.id, redirectTo });
}

export default function AdminLoginRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirectTo"));
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityPending, setSecurityPending] = useState(false);
  const isSubmitting = navigation.state !== "idle" || securityPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    if (isSubmitting) return;
    setSecurityError(null);
    setSecurityPending(true);

    try {
      await executeInvisibleRecaptcha(form, "admin_login");
      await submit(form, { method: "post", action: ADMIN_LOGIN_PATH });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    } finally {
      setSecurityPending(false);
    }
  }

  async function handleGoogleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    event.preventDefault();
    if (isSubmitting) return;

    setSecurityError(null);
    setSecurityPending(true);
    try {
      await executeInvisibleRecaptcha(form, "admin_google_login");
      await submit(form, { method: "post", action: "/auth/google" });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    } finally {
      setSecurityPending(false);
    }
  }

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
            <span className="material-symbols-outlined text-primary">lock</span>
          </div>

          {securityError || actionData?.error || searchParams.get("error") === "recaptcha" ? (
            <div className="mt-5 rounded-lg border border-red-100 bg-[#FFF5F5] p-3 text-sm font-bold text-[#D90000]">
              {securityError || actionData?.error || "Security check failed. Please try again."}
            </div>
          ) : null}

          <Form method="post" action="/auth/google" className="mt-6" onSubmit={handleGoogleSubmit}>
            <input type="hidden" name="mode" value="admin" />
            <input type="hidden" name="returnTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-5 text-sm font-black text-foreground shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
              <img src="/icons/google-g.png" alt="" className="h-5 w-auto shrink-0" aria-hidden="true" />
              Continue with Google
            </button>
          </Form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-black uppercase text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Form method="post" action={ADMIN_LOGIN_PATH} className="grid gap-4" onSubmit={handleSubmit}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            <label className="grid gap-2 text-sm font-black">
              Admin email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="h-12 rounded-lg border border-gray-200 px-4 font-medium outline-none focus:border-foreground"
              />
            </label>
            <label className="grid gap-2 text-sm font-black">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-12 rounded-lg border border-gray-200 px-4 font-medium outline-none focus:border-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-black text-white shadow-lg shadow-black/10 primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">login</span>
              {isSubmitting ? "Checking access..." : "Enter admin panel"}
            </button>
          </Form>
        </section>
      </section>
    </main>
  );
}

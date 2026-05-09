import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { Form, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import { getDbFromContext } from "../lib/db.server";
import {
  createAdminSession,
  getAdminSession,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyPassword } from "../lib/password.server";
import { attachRecaptchaToken } from "../lib/recaptcha.client";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

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

function hasTrustedOrigin(request: Request) {
  if (globalThis.process?.env?.NODE_ENV !== "production") {
    return true;
  }

  const origin = request.headers.get("Origin");

  if (!origin || origin === "null") {
    return true;
  }

  const trustedOrigins = new Set([
    new URL(request.url).origin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://edicut.com",
    "https://www.edicut.com",
  ]);

  try {
    return trustedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
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
  const attempt = getAttemptStore().get(key);

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
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempt.count += 1;
}

function clearFailedAttempts(key: string) {
  getAttemptStore().delete(key);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await getAdminSession(request.headers.get("Cookie"), context);

  if (session.has("adminUserId")) {
    throw redirect(ADMIN_BASE_PATH);
  }

  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!hasTrustedOrigin(request)) {
    return { error: "Admin request origin was rejected." };
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));

  if (!email || !password || password.length < 6) {
    return { error: "Use your admin email and password." };
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
    action: "admin_login",
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

  if (!user || !user.active || !user.passwordHash) {
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
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirectTo"));
  const isSubmitting = navigation.state === "submitting";
  const [securityError, setSecurityError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.currentTarget.dataset.recaptchaReady === "true") {
      event.currentTarget.dataset.recaptchaReady = "false";
      return;
    }

    event.preventDefault();
    setSecurityError(null);

    try {
      await attachRecaptchaToken(event.currentTarget, "admin_login");
      event.currentTarget.dataset.recaptchaReady = "true";
      event.currentTarget.requestSubmit();
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
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

          {securityError || actionData?.error ? (
            <div className="mt-5 rounded-lg border border-red-100 bg-[#FFF5F5] p-3 text-sm font-bold text-[#D90000]">
              {securityError || actionData?.error}
            </div>
          ) : null}

          <a
            href={`/auth/google?mode=admin&returnTo=${encodeURIComponent(redirectTo)}`}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-5 text-sm font-black text-foreground shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
          >
            <img src="/icons/google-flat.svg" alt="" className="h-5 w-5" aria-hidden="true" />
            Continue with Google
          </a>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-black uppercase text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Form method="post" action={ADMIN_LOGIN_PATH} reloadDocument className="grid gap-4" onSubmit={handleSubmit}>
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

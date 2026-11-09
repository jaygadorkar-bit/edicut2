# Inactive sign-in implementation archive

This snapshot preserves the pre-disable customer and admin sign-in flows, provider routes, password recovery routes, and shared Google OAuth server implementation. It is documentation only and is not imported by the application.

## apps/web/app/routes/signin.tsx

```tsx
import { safeRedirectPath } from "../lib/safe-redirect";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { AuthPage } from "../components/auth/AuthModal";
import { data, useLoaderData } from "react-router";
import { users } from "@edicut/db/schema";
import { findUserByEmail } from "@edicut/db/repositories/users";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import bcrypt from "bcryptjs";
import { createUserSession, isAdminRole, issueAuthCsrfToken, verifyAuthCsrfToken } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { verifyPassword } from "../lib/password.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { isLocalDevelopmentHostname } from "../lib/recaptcha.shared";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import {
  signInWithSupabase,
  signUpWithSupabase,
  supabaseAuthEnabled,
} from "../integrations/supabase/auth.server";

export const meta: MetaFunction = () => [
  { title: "Sign in - EdiCut" },
  { name: "description", content: "Sign in or create an account with EdiCut" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const csrf = await issueAuthCsrfToken(request, context);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);
  return data({ csrfToken: csrf.token }, { headers });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Sign-in request is too large. Please try again.", intent: "signin" };
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Sign-in request could not be read. Please try again.", intent: "signin" };
  const intent = String(formData.get("intent") || "");
  if (!await verifyAuthCsrfToken(request, formData.get("csrfToken"), context)) {
    const csrf = await issueAuthCsrfToken(request, context);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);
    return data({
      error: "This sign-in form expired. Please try again.",
      intent,
      csrfToken: csrf.token,
    }, { headers });
  }
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const remember = formData.get("remember") === "on";
  const redirectTo = safeRedirectPath(formData.get("redirectTo"));

  if (!(["signin", "signup"] as const).includes(intent as "signin" | "signup") || !email || email.length > 254 || !password || password.length < 6 || password.length > 1024) {
    return { error: "Invalid email or password (min 6 characters).", intent };
  }

  if (intent === "signup" && (password.length < 12 || new TextEncoder().encode(password).byteLength > 72)) {
    return { error: "Use at least 12 characters and a password no longer than 72 bytes.", intent };
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
      intent,
    };
  }

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (intent === "signup" && name.length > 120) {
    return { error: "Your name must be 120 characters or fewer.", intent };
  }

  // Localhost testing still keeps request and identity rate limits, but Google CAPTCHA tokens
  // are not reliable for loopback hosts and can prevent developers from testing authentication.
  const captcha = isLocalDevelopmentHostname(new URL(request.url).hostname)
    ? { success: true as const }
    : await verifyRecaptchaToken({
        context,
        token: formData.get("g-recaptcha-response"),
      });

  if (!captcha.success) {
    return { error: captcha.error, intent };
  }

  const db = getDbFromContext(context);
  const adminUser = intent === "signin" ? await findAdminUserByEmail(db, email) : null;
  const useSupabase = supabaseAuthEnabled(context);
  const adminCredentialsVerified = Boolean(
    !useSupabase &&
    adminUser?.active &&
    isAdminRole(adminUser.role) &&
    adminUser.passwordHash &&
    await verifyPassword(password, adminUser.passwordHash),
  );

  if (intent === "signup") {
    if (useSupabase) {
      const result = await signUpWithSupabase({
        context,
        email,
        password,
        name,
      });

      if (result.error) {
        return { error: result.error, intent };
      }

      if (!result.user || !result.session) {
        return {
          error: "Account created. Check your email to confirm the account before signing in.",
          intent,
        };
      }

      return createUserSession({
        request,
        context,
        userId: result.profileId ?? result.user.id,
        remember,
        redirectTo,
        accessToken: result.session.access_token,
        refreshToken: result.session.refresh_token,
      });
    }

    const existing = await findUserByEmail(db, email);
    if (existing) {
      return { error: "User with this email already exists.", intent };
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const [user] = await db.insert(users).values({
      email,
      name: name || null,
      passwordHash,
    }).returning();

    return createUserSession({ request, context, userId: user.id, remember, redirectTo });
  }

  if (intent === "signin") {
    if (useSupabase) {
      const result = await signInWithSupabase({ context, email, password });

      if (!result.error && result.user && result.session) {
        const verifiedAdminIdentity = Boolean(
          adminUser?.active &&
          isAdminRole(adminUser.role) &&
          result.user.email?.trim().toLowerCase() === adminUser.email.toLowerCase() &&
          result.user.email_confirmed_at,
        );

        return createUserSession({
          request,
          context,
          userId: result.profileId ?? result.user.id,
          remember,
          redirectTo,
          accessToken: result.session.access_token,
          refreshToken: result.session.refresh_token,
          adminUserId: verifiedAdminIdentity ? adminUser?.id : undefined,
          adminAccessVerified: verifiedAdminIdentity,
        });
      }

      // A provider rejection must not be bypassed with an older local password.
      if (result.error) return { error: "Invalid credentials.", intent };

      return { error: "Supabase did not return an authenticated session.", intent };
    }

    const user = await findUserByEmail(db, email);
    if (!user || !user.passwordHash) {
      if (adminUser?.active && isAdminRole(adminUser.role) && adminUser.passwordHash && await verifyPassword(password, adminUser.passwordHash)) {
        const existingProfile = user || await findUserByEmail(db, email);
        if (existingProfile && (!existingProfile.active || existingProfile.deletedAt)) {
          return { error: "Invalid credentials.", intent };
        }
        const [profile] = existingProfile
          ? [existingProfile]
          : await db.insert(users).values({
              email,
              name: adminUser.name,
              role: "customer",
              active: true,
              passwordHash: adminUser.passwordHash,
            }).returning();

        if (profile) {
          return createUserSession({
            request,
            context,
            userId: profile.id,
            remember,
            redirectTo,
            adminUserId: adminUser.id,
            adminAccessVerified: true,
          });
        }
      }

      return { error: "Invalid credentials.", intent };
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid || !user.active || user.deletedAt) {
      return { error: "Invalid credentials.", intent };
    }

    return createUserSession({
      request,
      context,
      userId: user.id,
      remember,
      redirectTo,
      adminUserId: adminCredentialsVerified ? adminUser?.id : undefined,
      adminAccessVerified: adminCredentialsVerified,
    });
  }

  return { error: "Unknown intent", intent };
}

export default function SigninPage() {
  const { csrfToken } = useLoaderData<typeof loader>();
  return <AuthPage csrfToken={csrfToken} />;
}

```

## apps/web/app/routes/auth-google.ts

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { googleSignInPath, startGoogleOAuth } from "../lib/google-auth.server";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { isLocalDevelopmentHostname } from "../lib/recaptcha.shared";
import { requestBodyExceedsLimit } from "../lib/usage-protection.server";
import type { LoaderContext } from "../types";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
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
  if (!isSameSiteMutation(request)) return forbiddenMutation();
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
  try {
    return await startGoogleOAuth(request, context as LoaderContext, formData);
  } catch {
    console.error("Google sign-in could not be started.");
    const returnTo = formData.get("returnTo");
    return redirect(googleSignInPath(mode, typeof returnTo === "string" ? returnTo : null, "google-unavailable"), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

```

## apps/web/app/routes/auth-google-callback.ts

```tsx
import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { completeGoogleOAuth, createGoogleOAuthFailureResponse } from "../lib/google-auth.server";
import type { LoaderContext } from "../types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const typedContext = context as LoaderContext;
  let stage = "transaction";
  try {
    return await completeGoogleOAuth(request, typedContext, () => getDbFromContext(typedContext ?? {}), (value) => { stage = value; });
  } catch (error) {
    // Preserve intentional redirects and access denials. Never send database
    // queries, profile data, or provider tokens through this resource route.
    if (error instanceof Response && error.status < 500) throw error;
    const cause = error instanceof Error ? error.cause ?? error : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    const databaseCode = typeof code === "string" && /^(?:[A-Z0-9]{5}|CONNECT_TIMEOUT|CONNECTION_CLOSED|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code) ? code : undefined;
    console.error("Google sign-in could not be completed.", {
      status: error instanceof Response ? error.status : 500,
      stage,
      ...(databaseCode ? { databaseCode } : {}),
    });
    return createGoogleOAuthFailureResponse(request, typedContext);
  }
}

```

## apps/web/app/routes/forgot-password.tsx

```tsx
import { safeRedirectPath } from "../lib/safe-redirect";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { Form, Link, useActionData, useNavigation, useSearchParams, useSubmit } from "react-router";
import { KeyRound } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { resolveWebEnv } from "../lib/context.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";

type ForgotPasswordActionData = {
  error?: string;
  sent?: boolean;
};

export const meta: MetaFunction = () => [
  { title: "Reset password - EdiCut" },
  { name: "description", content: "Request a secure EdiCut password reset link." },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Password reset request is too large. Please try again." } satisfies ForgotPasswordActionData;
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Password reset request could not be read. Please try again." } satisfies ForgotPasswordActionData;
  const emailValue = formData.get("email");

  if (typeof emailValue !== "string" || !emailValue.trim() || emailValue.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim())) {
    return { error: "Enter the email address for your EdiCut account." } satisfies ForgotPasswordActionData;
  }

  const identityKey = await hashUsageLimitKey(emailValue.trim().toLowerCase());
  const resetLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "PASSWORD_RESET_LIMITER",
    key: `reset:${identityKey}`,
    localLimit: 1,
    localPeriodSeconds: 60,
  });
  if (resetLimit !== "allowed") {
    return {
      error: resetLimit === "limited"
        ? "A reset request was sent recently. Wait a minute before trying again."
        : "Password reset protection is temporarily unavailable. Please try again shortly.",
    } satisfies ForgotPasswordActionData;
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });
  if (!captcha.success) {
    return { error: captcha.error } satisfies ForgotPasswordActionData;
  }

  const client = getSupabaseClient(context);
  if (!client) {
    return {
      error: "Password recovery is temporarily unavailable. Please try again later.",
    } satisfies ForgotPasswordActionData;
  }

  const appUrl = resolveWebEnv(context).APP_URL || new URL(request.url).origin;
  const redirectTo = new URL("/update-password", appUrl).toString();
  const { error } = await client.auth.resetPasswordForEmail(emailValue.trim().toLowerCase(), { redirectTo });

  if (error) {
    return {
      error: "We could not send the reset email right now. Please try again later.",
    } satisfies ForgotPasswordActionData;
  }

  return { sent: true } satisfies ForgotPasswordActionData;
}

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const actionData = useActionData<ForgotPasswordActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo") || "/dashboard");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityPending, setSecurityPending] = useState(false);
  const submitting = navigation.state !== "idle" || securityPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    event.preventDefault();
    if (submitting) return;

    setSecurityError(null);
    setSecurityPending(true);
    try {
      const { executeInvisibleRecaptcha } = await import("../lib/recaptcha.client");
      await executeInvisibleRecaptcha(form, "password_reset");
      await submit(form, { method: "post", action: "/forgot-password" });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    } finally {
      setSecurityPending(false);
    }
  }

  return (
    <main className="min-h-screen neo-home flex items-center justify-center px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-[520px] items-center justify-center rounded-[2.5rem] neo-surface p-8 shadow-2xl sm:p-12">
        <section className="w-full">
          <Link
            to={`/signin?redirectTo=${encodeURIComponent(redirectTo)}`}
            className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black neo-muted transition hover:text-black"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to sign in
          </Link>

          <div className="mt-8">
            <span className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-black uppercase tracking-wider neo-section-label">
              <KeyRound size={15} aria-hidden="true" />
              Account Recovery
            </span>
            <h1 className="yt-title mt-3 font-black neo-ink">Reset password</h1>
            <p className="mt-2 text-xs font-medium leading-relaxed neo-muted">
              Enter your account email and we will send a secure link to choose a new password.
            </p>
          </div>

          {actionData?.sent ? (
            <div className="neo-inset mt-8 rounded-2xl p-5 border border-emerald-300 bg-emerald-50/50 text-xs font-bold leading-relaxed text-emerald-800">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-emerald-600">mark_email_read</span>
                <span>Reset link sent</span>
              </div>
              <p className="mt-2 text-emerald-700">
                If an account matches that email, a password reset link is on its way. Check your inbox and spam folder.
              </p>
            </div>
          ) : (
            <Form method="post" className="mt-8 grid gap-4" onSubmit={handleSubmit} aria-busy={submitting}>
              <input type="hidden" name="g-recaptcha-response" value="" />
              {securityError || actionData?.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                  {securityError || actionData?.error}
                </div>
              ) : null}

              <label className="grid gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] neo-muted">Account Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="alex@creator.com"
                  autoComplete="email"
                  className="neo-inset h-12 rounded-xl px-3.5 text-sm font-bold outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="neo-button neo-button--primary mt-2 w-full justify-center text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">mail</span>
                <span>{submitting ? "Sending link..." : "Send Reset Link"}</span>
              </button>
            </Form>
          )}

          {actionData?.sent ? (
            <Link
              to={`/signin?redirectTo=${encodeURIComponent(redirectTo)}`}
              className="neo-card mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl text-xs font-black neo-ink transition hover:border-primary/40"
            >
              Return to sign in
            </Link>
          ) : null}
        </section>
      </div>
    </main>
  );
}

```

## apps/web/app/routes/update-password.tsx

```tsx
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useSearchParams, useNavigation } from "react-router";
import { ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { adminUsers, users } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";

type UpdatePasswordActionData = {
  error?: string;
};

type RecoveryTokens = {
  accessToken: string;
  refreshToken: string;
};

export const meta: MetaFunction = () => [
  { title: "Choose a new password - EdiCut" },
  { name: "description", content: "Choose a new password for your EdiCut account." },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Password update request is too large. Please try again." } satisfies UpdatePasswordActionData;
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Password update request could not be read. Please try again." } satisfies UpdatePasswordActionData;
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const accessToken = formData.get("accessToken");
  const refreshToken = formData.get("refreshToken");
  const code = formData.get("code");

  if (typeof password !== "string" || password.length < 12 || new TextEncoder().encode(password).byteLength > 72) {
    return { error: "Use at least 12 characters and a password no longer than 72 bytes." } satisfies UpdatePasswordActionData;
  }

  if (password !== confirmPassword) {
    return { error: "The passwords do not match." } satisfies UpdatePasswordActionData;
  }

  const recoveryCredential = typeof code === "string" && code
    ? code
    : typeof accessToken === "string" && accessToken
      ? accessToken
      : "missing-recovery-credential";
  const recoveryKey = await hashUsageLimitKey(recoveryCredential);
  const recoveryLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "AUTH_IDENTITY_LIMITER",
    key: `password-update:${recoveryKey}`,
    localLimit: 3,
    localPeriodSeconds: 60,
  });
  if (recoveryLimit !== "allowed") {
    return {
      error: recoveryLimit === "limited"
        ? "Too many password update attempts. Wait a minute and try again."
        : "Password update protection is temporarily unavailable. Please try again shortly.",
    } satisfies UpdatePasswordActionData;
  }

  const client = getSupabaseClient(context);
  if (!client) {
    return {
      error: "Password recovery is temporarily unavailable. Please request a new link later.",
    } satisfies UpdatePasswordActionData;
  }

  try {
    let updateClient = client;

    if (typeof code === "string" && code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        return { error: "This reset link is invalid or has expired. Request a new one." } satisfies UpdatePasswordActionData;
      }
    } else if (typeof accessToken === "string" && accessToken && typeof refreshToken === "string" && refreshToken) {
      const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        return { error: "This reset link is invalid or has expired. Request a new one." } satisfies UpdatePasswordActionData;
      }
    } else if (typeof accessToken === "string" && accessToken) {
      updateClient = getSupabaseClient(context, accessToken) ?? client;
    } else {
      return { error: "This reset link is missing or has expired. Request a new one." } satisfies UpdatePasswordActionData;
    }

    const { data, error } = await updateClient.auth.updateUser({ password });
    if (error || !data.user?.email_confirmed_at || !data.user.email) {
      return { error: "We could not update your password. Request a new reset link and try again." } satisfies UpdatePasswordActionData;
    }
    // Keep both application credential stores in sync so old local cookies fail
    // their credential proof immediately, including Google-created sessions.
    const passwordHash = await bcrypt.hash(password, 12);
    const db = getDbFromContext(context);
    const email = data.user.email.trim().toLowerCase();
    await Promise.all([
      db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.email, email)),
      db.update(adminUsers).set({ passwordHash, updatedAt: new Date() }).where(eq(adminUsers.email, email)),
    ]);
  } catch {
    return { error: "We could not update your password. Request a new reset link and try again." } satisfies UpdatePasswordActionData;
  }

  throw redirect("/signin?reset=success");
}

export default function UpdatePasswordPage() {
  const [searchParams] = useSearchParams();
  const actionData = useActionData<UpdatePasswordActionData>();
  const navigation = useNavigation();
  const [tokens, setTokens] = useState<RecoveryTokens>({ accessToken: "", refreshToken: "" });
  const code = searchParams.get("code") || "";
  const submitting = navigation.state !== "idle";

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setTokens({
      accessToken: hashParams.get("access_token") || "",
      refreshToken: hashParams.get("refresh_token") || "",
    });
  }, []);

  const hasRecoveryToken = Boolean(code || tokens.accessToken);

  return (
    <main className="min-h-screen neo-home flex items-center justify-center px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-[520px] items-center justify-center rounded-[2.5rem] neo-surface p-8 shadow-2xl sm:p-12">
        <section className="w-full">
          <Link
            to="/signin"
            className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black neo-muted transition hover:text-black"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to sign in
          </Link>

          <div className="mt-8">
            <span className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-black uppercase tracking-wider neo-section-label">
              <ShieldCheck size={15} aria-hidden="true" />
              Security Update
            </span>
            <h1 className="yt-title mt-3 font-black neo-ink">Choose a new password</h1>
            <p className="mt-2 text-xs font-medium leading-relaxed neo-muted">
              Set a strong new password for your EdiCut account, then sign in again.
            </p>
          </div>

          {!hasRecoveryToken ? (
            <div className="neo-inset mt-8 rounded-2xl p-5 border border-amber-300 bg-amber-50/50 text-xs font-bold leading-relaxed text-amber-800">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-amber-600">warning</span>
                <span>Invalid or expired link</span>
              </div>
              <p className="mt-2 text-amber-700">
                Open the password reset link directly from your email. If it has expired, request a new link.
              </p>
              <Link to="/forgot-password" className="mt-4 inline-block font-black text-primary underline">
                Request new password reset link →
              </Link>
            </div>
          ) : (
            <Form method="post" className="mt-8 grid gap-4">
              {actionData?.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                  {actionData.error}
                </div>
              ) : null}

              <input type="hidden" name="accessToken" value={tokens.accessToken} />
              <input type="hidden" name="refreshToken" value={tokens.refreshToken} />
              <input type="hidden" name="code" value={code} />

              <label className="grid gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] neo-muted">New Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={72}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="neo-inset h-12 rounded-xl px-3.5 text-sm font-bold outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] neo-muted">Confirm Password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={72}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="neo-inset h-12 rounded-xl px-3.5 text-sm font-bold outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="neo-button neo-button--primary mt-2 w-full justify-center text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                <span>{submitting ? "Updating password..." : "Update Password"}</span>
              </button>
            </Form>
          )}
        </section>
      </div>
    </main>
  );
}

```

## apps/web/app/routes/admin-login.tsx

```tsx
import { safeAdminRedirect } from "../lib/safe-redirect";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation, useSearchParams, useSubmit } from "react-router";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import { getDbFromContext } from "../lib/db.server";
import {
  createAdminSession,
  getAdminSession,
  destroyAdminSession,
  requireAdminUser,
  isAdminRole,
  issueAuthCsrfToken,
  verifyAuthCsrfToken,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { verifyPassword } from "../lib/password.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { isLocalDevelopmentHostname } from "../lib/recaptcha.shared";
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

export function headers({ loaderHeaders, actionHeaders }: { loaderHeaders: Headers; actionHeaders: Headers }) {
  const headers = new Headers(actionHeaders.has("Set-Cookie") ? actionHeaders : loaderHeaders);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "same-origin");
  return headers;
}

function safeRedirectTo(value: FormDataEntryValue | string | null) {
  return safeAdminRedirect(value);
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
  const csrf = await issueAuthCsrfToken(request, context);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);

  const session = await getAdminSession(request.headers.get("Cookie"), context);

  if (session.has("adminUserId")) {
    try {
      await requireAdminUser(request, getDbFromContext(context), context);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 302) throw error;
      headers.append("Set-Cookie", await destroyAdminSession(session, context));
      return data({ csrfToken: csrf.token }, { headers });
    }
    throw redirect(ADMIN_BASE_PATH);
  }

  return data({ csrfToken: csrf.token }, { headers });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return { error: "Admin request origin was rejected." };
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Admin sign-in request is too large. Please try again." };
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Admin sign-in request could not be read. Please try again." };
  if (!await verifyAuthCsrfToken(request, formData.get("csrfToken"), context)) {
    const csrf = await issueAuthCsrfToken(request, context);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (csrf.setCookie) headers.append("Set-Cookie", csrf.setCookie);
    return data({ error: "This sign-in form expired. Please try again.", csrfToken: csrf.token }, { headers });
  }
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

  const captcha = isLocalDevelopmentHostname(new URL(request.url).hostname)
    ? { success: true as const }
    : await verifyRecaptchaToken({
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
    if (!result.error && result.user?.email_confirmed_at && result.session && result.user.email?.trim().toLowerCase() === user.email.trim().toLowerCase()) {
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
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get("redirectTo"));
  const googleError = {
    recaptcha: "Security check failed. Please try again.",
    "auth-request": "Your sign-in request expired. Please try again.",
    "google-state": "Google sign-in expired or could not be verified. Please try again.",
    "google-cancelled": "Google sign-in was cancelled. You can try again or sign in with email.",
    "google-email": "Google could not confirm ownership of this email address. Sign in with email instead.",
    "google-unavailable": "Google sign-in could not be completed. Please start a new sign-in attempt.",
    "account-unavailable": "Admin access is unavailable for this account.",
  };
  const errorCode = searchParams.get("error") ?? "";
  const googleErrorMessage = Object.hasOwn(googleError, errorCode) ? googleError[errorCode as keyof typeof googleError] : undefined;
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityPending, setSecurityPending] = useState(false);
  const isSubmitting = navigation.state !== "idle" || securityPending;
  const csrfToken = actionData && "csrfToken" in actionData ? actionData.csrfToken : loaderData.csrfToken;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    if (isSubmitting) return;
    setSecurityError(null);
    setSecurityPending(true);

    try {
      if (!isLocalDevelopmentHostname(window.location.hostname)) {
        const { executeInvisibleRecaptcha } = await import("../lib/recaptcha.client");
        await executeInvisibleRecaptcha(form, "admin_login");
      }
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
      if (!isLocalDevelopmentHostname(window.location.hostname)) {
        const { executeInvisibleRecaptcha } = await import("../lib/recaptcha.client");
        await executeInvisibleRecaptcha(form, "admin_google_login");
      }
      form.submit();
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

          {securityError || actionData?.error || googleErrorMessage ? (
            <div role="alert" className="mt-5 rounded-lg border border-red-100 bg-[#FFF5F5] p-3 text-sm font-bold text-[#D90000]">
              {securityError || actionData?.error || googleErrorMessage}
            </div>
          ) : null}

          <form method="post" action="/auth/google" className="mt-6" onSubmit={handleGoogleSubmit}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="mode" value="admin" />
            <input type="hidden" name="returnTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-5 text-sm font-black text-foreground shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
              <img src="/icons/google-g.png" alt="" className="h-5 w-auto shrink-0" aria-hidden="true" />
              Continue with Google
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-black uppercase text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Form method="post" action={ADMIN_LOGIN_PATH} className="grid gap-4" onSubmit={handleSubmit}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
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

```

## apps/web/app/components/auth/AuthModal.tsx

```tsx
import { safeRedirectPath } from "../../lib/safe-redirect";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { authHref, type AuthMode } from "./auth-links";
import { isLocalDevelopmentHostname } from "../../lib/recaptcha.shared";

export { authHref } from "./auth-links";

type AuthActionData = {
  error?: string;
  intent?: string;
  csrfToken?: string;
};

export function AuthPage({ csrfToken: loaderCsrfToken }: { csrfToken: string }) {
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<AuthActionData>();
  const requestedMode = searchParams.get("mode") || searchParams.get("auth");
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo") || "/dashboard");
  const resetComplete = searchParams.get("reset") === "success";
  const mode: AuthMode = requestedMode === "signup" ? "signup" : "signin";
  const csrfToken = fetcher.data?.csrfToken ?? loaderCsrfToken;
  const [showPassword, setShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const error = fetcher.data?.intent === mode || fetcher.data?.intent === "google"
    ? fetcher.data.error
    : undefined;
  const googleStateError = searchParams.get("error") === "google-state"
    ? "Google sign-in expired or could not be verified. Please try again."
    : undefined;
  const googleCancelled = searchParams.get("error") === "google-cancelled"
    ? "Google sign-in was cancelled. You can try again or sign in with email."
    : undefined;
  const googleEmailError = searchParams.get("error") === "google-email"
    ? "Google could not confirm ownership of this email address. Sign in with email instead."
    : undefined;
  const googleRequestError = searchParams.get("error") === "auth-request"
    ? "Your sign-in request expired. Please try again."
    : undefined;
  const googleUnavailableError = searchParams.get("error") === "google-unavailable"
    ? "Google sign-in could not be completed. Please start a new sign-in attempt."
    : undefined;
  const googleCaptchaError = searchParams.get("error") === "recaptcha"
    ? "Security check failed. Please try again."
    : undefined;
  const accountError = searchParams.get("error") === "account-unavailable"
    ? "This account is unavailable. Contact EdiCut support."
    : undefined;
  const visibleError = securityError || error || googleStateError || googleCancelled || googleEmailError || googleRequestError || googleUnavailableError || googleCaptchaError || accountError;
  const submitting = fetcher.state !== "idle";
  const busy = submitting || emailChecking;

  useEffect(() => {
    setSecurityError(null);
    setShowPassword(false);
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    if (busy) return;
    setSecurityError(null);
    setEmailChecking(true);

    try {
      const formData = new FormData(form);
      if (!isLocalDevelopmentHostname(window.location.hostname)) {
        const { executeInvisibleRecaptcha } = await import("../../lib/recaptcha.client");
        formData.set(
          "g-recaptcha-response",
          await executeInvisibleRecaptcha(form, mode === "signup" ? "dashboard_signup" : "dashboard_signin")
        );
      }
      fetcher.submit(formData, { method: "post", action: "/signin" });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    } finally {
      setEmailChecking(false);
    }
  }

  return (
    <main className="auth-page neo-home">
      <div className="auth-layout">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-topbar">
            <Link to="/" className="auth-brand" aria-label="EdiCut home">
              <img src="/icons/edicut-logo.svg" alt="EdiCut" width="1162" height="506" />
            </Link>
            <Link to="/" className="auth-home-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to home
            </Link>
          </header>

          <div className="auth-heading">
            <h1 id="auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
            <p>{mode === "signup" ? "Your edits, feedback, and files in one place." : "Sign in to your EdiCut workspace."}</p>
          </div>

          <div className="auth-google-form">
            <form method="post" action="/auth/google" className="w-full">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="mode" value="user" />
              <input type="hidden" name="returnTo" value={redirectTo} />
              <button type="submit" disabled={busy} className="auth-button auth-button--link w-full">
                <img src="/icons/google-g.png" alt="" width="200" height="204" className="auth-google-icon" />
                <span>{emailChecking ? "Checking security…" : submitting ? "Opening Google…" : "Continue with Google"}</span>
              </button>
            </form>
          </div>

          <div className="auth-divider" aria-hidden="true"><span>or</span></div>

          {visibleError ? (
            <p id="auth-feedback" className="auth-alert auth-alert--error" role="alert">{visibleError}</p>
          ) : null}
          {resetComplete ? (
            <p className="auth-alert auth-alert--success" role="status">Your password has been updated. Sign in with your new password.</p>
          ) : null}

          <fetcher.Form method="post" action="/signin" className="auth-form" onSubmit={handleSubmit} aria-busy={emailChecking || submitting} aria-describedby={visibleError ? "auth-feedback" : undefined}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value={mode} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            {mode === "signup" ? <AuthField label="Full name" name="name" placeholder="Your name" /> : null}
            <AuthField label="Email address" name="email" type="email" placeholder="you@example.com" />
            <PasswordField
              label="Password"
              name="password"
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" ? (
              <input type="hidden" name="remember" value="on" />
            ) : (
              <div className="auth-options">
                <label className="auth-remember">
                  <input type="checkbox" name="remember" />
                  <span>Remember me</span>
                </label>
                <Link to={`/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`} className="auth-link">Forgot password?</Link>
              </div>
            )}
            <button type="submit" disabled={busy} className="auth-button auth-button--primary">
              <span aria-live="polite">
                {emailChecking ? "Checking security…" : submitting ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
              </span>
            </button>
          </fetcher.Form>

          <p className="auth-account-switch">
            {mode === "signup" ? "Already have an account?" : "New to EdiCut?"}{" "}
            <Link
              to={authHref("/signin", "", mode === "signup" ? "signin" : "signup", redirectTo)}
              className="auth-link"
              aria-disabled={busy}
              onClick={(event) => { if (busy) event.preventDefault(); }}
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </section>

        <p className="auth-legal">
          By continuing, you agree to our <Link to="/terms">Terms</Link> and acknowledge our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

function AuthField({
  label,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
}) {
  const autoComplete = name === "name" ? "name" : name === "email" ? "email" : undefined;

  return (
    <div className="auth-field">
      <label htmlFor={`auth-${name}`}>{label}</label>
      <input
        id={`auth-${name}`}
        name={name}
        type={type}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="auth-input"
      />
    </div>
  );
}

function PasswordField({
  label,
  name,
  show,
  onToggle,
  autoComplete,
}: {
  label: string;
  name: string;
  show: boolean;
  onToggle: () => void;
  autoComplete: "current-password" | "new-password";
}) {
  return (
    <div className="auth-field">
      <label htmlFor={`auth-${name}`}>{label}</label>
      <div className="auth-password-control">
        <input
          id={`auth-${name}`}
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={autoComplete === "new-password" ? 12 : 6}
          maxLength={autoComplete === "new-password" ? 72 : 1024}
          placeholder={autoComplete === "new-password" ? "At least 12 characters" : "Enter your password"}
          autoComplete={autoComplete}
          className="auth-input"
        />
        <button type="button" onClick={onToggle} className="auth-password-toggle" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

```

## apps/web/app/lib/google-auth.server.ts

```tsx
import { safeAdminRedirect, safeRedirectPath } from "./safe-redirect";
import { redirect } from "react-router";
import { and, eq, isNull, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { users } from "@edicut/db/schema";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import type { DatabaseClient } from "@edicut/db/client";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import {
  commitAdminSession,
  createUserSession,
  getAdminSession,
  getGoogleOAuthCookie,
  isAdminRole,
} from "./session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";
import { retryDatabaseRead } from "./database-errors";
import type { LoaderContext } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

type EnvSource = Record<string, string | undefined>;

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
};
type VerifiedGoogleProfile = { email: string; name: string | null; picture: string | null };

type GoogleOAuthMode = "user" | "admin";

const transactionLifetimeMs = 600_000;
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
type GoogleError = "google-unavailable" | "google-state" | "google-cancelled" | "google-email" | "account-unavailable";
type OAuthTransaction = {
  mode: GoogleOAuthMode;
  state: string;
  verifier: string;
  expiresAt: number;
  returnTo: string;
};

function parseEnvText(text: string): EnvSource {
  const env: EnvSource = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const value = match[2].replace(/^["']|["']$/g, "").trim();
    if (value) env[match[1]] = value;
  }

  return env;
}

function readLocalEnvFile(path: string): EnvSource {
  if (!globalThis.process?.versions?.node) return {};

  try {
    const filePath = resolveLocalFile(path);
    if (!filePath) return {};

    if (path.endsWith(".json")) {
      return JSON.parse(readFileSync(filePath, "utf8")) as EnvSource;
    }

    return parseEnvText(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function resolveLocalFile(path: string) {
  let current = globalThis.process?.cwd?.() ?? ".";

  for (let index = 0; index < 5; index += 1) {
    const candidate = join(current, path);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return existsSync(path) ? path : null;
}

function readEnv(context?: LoaderContext): EnvSource {
  if (context?.cf?.env) return context.cf.env;
  const nodeEnv = globalThis.process?.env ?? {};
  const viteEnv = typeof import.meta !== "undefined" ? (import.meta.env as EnvSource) : {};
  const localEnv = {
    ...readLocalEnvFile(".env"),
    ...readLocalEnvFile(".env.local"),
    ...readLocalEnvFile("secrets.json"),
  };

  return {
    ...localEnv,
    ...viteEnv,
    ...nodeEnv,
  };
}

function configuredAppUrl(env: EnvSource) {
  return firstPresent(env.APP_URL, env.NEXT_PUBLIC_APP_URL, "http://localhost:3002")!;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function readRequiredGoogleEnv(context?: LoaderContext) {
  const env = readEnv(context);
  const clientId = firstPresent(env.AUTH_GOOGLE_ID);
  const clientSecret = firstPresent(env.AUTH_GOOGLE_SECRET);

  if (!clientId || !clientSecret) {
    throw new Response("Google sign-in is not configured.", { status: 503 });
  }

  const appUrl = new URL(configuredAppUrl(env));
  const callback = new URL(firstPresent(env.AUTH_GOOGLE_REDIRECT_URI) ?? GOOGLE_CALLBACK_PATH, appUrl);
  if (appUrl.username || appUrl.password || (appUrl.protocol !== "https:" &&
    !(appUrl.protocol === "http:" && isLoopbackHostname(appUrl.hostname))) ||
    callback.origin !== appUrl.origin || callback.pathname !== GOOGLE_CALLBACK_PATH ||
    callback.username || callback.password || callback.search || callback.hash) {
    throw new Response("Google sign-in callback is not configured correctly.", { status: 503 });
  }
  return { clientId, clientSecret, appUrl: appUrl.origin, redirectUri: callback.href };
}

function firstPresent(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function randomHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedReturnTo(value: unknown) {
  return typeof value === "string" && new TextEncoder().encode(value).length <= 1024 ? value : null;
}

function safeUserReturnTo(value: unknown) {
  const destination = boundedReturnTo(safeRedirectPath(value)) ?? "/dashboard";
  try {
    const pathname = decodeURIComponent(new URL(destination, "https://redirect.invalid").pathname);
    return /^(?:\/auth|\/api\/auth|\/signin|\/signout)(?:\/|$)/i.test(pathname) ? "/dashboard" : destination;
  } catch {
    return "/dashboard";
  }
}

function safeAdminReturnTo(value: unknown) {
  return boundedReturnTo(safeAdminRedirect(value)) ?? ADMIN_BASE_PATH;
}

async function readTransaction(request: Request, context?: LoaderContext): Promise<OAuthTransaction | null> {
  try {
    const stored = await getGoogleOAuthCookie(context).parse(request.headers.get("Cookie"));
    if ((stored?.mode !== "user" && stored?.mode !== "admin") ||
      typeof stored.state !== "string" || !/^[a-f0-9]{64}$/.test(stored.state) ||
      typeof stored.verifier !== "string" || !/^[a-f0-9]{64}$/.test(stored.verifier) ||
      !Number.isSafeInteger(stored.expiresAt) || typeof stored.returnTo !== "string") return null;
    return stored;
  } catch {
    return null;
  }
}

export function googleSignInPath(mode: GoogleOAuthMode, returnTo: string | null, error?: GoogleError) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (returnTo) params.set("redirectTo", mode === "admin" ? safeAdminReturnTo(returnTo) : safeUserReturnTo(returnTo));
  return `${mode === "admin" ? ADMIN_LOGIN_PATH : "/signin"}${params.size ? `?${params}` : ""}`;
}

export async function createGoogleOAuthFailureResponse(request: Request, context?: LoaderContext, error: GoogleError = "google-unavailable") {
  const stored = await readTransaction(request, context);
  return googleFailure(stored, new URL(request.url).searchParams.get("state"), context, error);
}

async function googleFailure(stored: OAuthTransaction | null, state: string | null, context: LoaderContext | undefined, error: GoogleError) {
  const headers = new Headers(privateHeaders);
  // An unrelated or stale callback must not erase a newer attempt.
  if (stored && state === stored.state) {
    headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));
  }
  return redirect(googleSignInPath(stored?.mode ?? "user", stored?.returnTo ?? null, error), { headers });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navigationPage(destination: string, title: string, link: string, headers: Headers, back?: string) {
  const href = escapeHtml(destination);
  headers.set("Content-Type", "text/html; charset=utf-8");
  // Use the HTTP Refresh header as well as the HTML fallback. Some embedded
  // browsers keep the provider's account chooser active unless navigation is
  // issued directly by the response.
  headers.set("Refresh", `0; url=${destination}`);
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${href}">
    <title>${escapeHtml(title)} · EdiCut</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p><a href="${href}">${escapeHtml(link)}</a></p>
      ${back ? `<p><a href="${escapeHtml(back)}">Back to EdiCut sign-in</a></p>` : ""}
    </main>
  </body>
</html>`, { headers });
}

async function createAdminOAuthCompletionResponse({
  context,
  userId,
  redirectTo,
  appUrl,
  profile,
}: {
  context?: LoaderContext;
  userId: string;
  redirectTo: string;
  appUrl: string;
  profile: VerifiedGoogleProfile;
}) {
  const session = await getAdminSession(null, context);
  session.set("adminUserId", userId);
  session.set("profileEmail", profile.email);
  session.set("profileImageUrl", profile.picture);

  const headers = new Headers(privateHeaders);

  headers.append(
    "Set-Cookie",
    await commitAdminSession(session, { maxAge: 60 * 60 * 2 }, context)
  );
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));

  // A new document ends Google's redirect chain before sending the Strict admin cookie.
  return navigationPage(new URL(redirectTo, appUrl).href, "Opening admin panel", "Continue to admin panel", headers);
}

export async function startGoogleOAuth(request: Request, context: LoaderContext | undefined, formData: FormData) {
  const requestUrl = new URL(request.url);
  const mode = formData.get("mode") === "admin" ? "admin" : "user";
  const requestedReturnTo = formData.get("returnTo");
  const returnTo = mode === "admin"
    ? safeAdminReturnTo(requestedReturnTo)
    : safeUserReturnTo(requestedReturnTo);
  const { clientId, appUrl, redirectUri } = readRequiredGoogleEnv(context);
  if (requestUrl.origin !== appUrl) {
    return redirect(new URL(googleSignInPath(mode, returnTo), appUrl).href, { status: 303, headers: privateHeaders });
  }

  const state = randomHex();
  const verifier = randomHex();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  // End the form navigation before starting the cross-origin OAuth navigation.
  const headers = new Headers(privateHeaders);
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize({ mode, state, verifier, expiresAt: Date.now() + transactionLifetimeMs, returnTo }));
  return navigationPage(url.href, "Opening Google sign-in", "Continue to Google", headers, googleSignInPath(mode, returnTo));
}

export async function completeGoogleOAuth(
  request: Request,
  context: LoaderContext | undefined,
  getDb: () => DatabaseClient,
  onStage: (stage: string) => void = () => {},
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const stored = await readTransaction(request, context);
  const fail = (error: GoogleError) => googleFailure(stored, state, context, error);

  if (!stored || state !== stored.state || stored.expiresAt <= Date.now()) {
    return fail("google-state");
  }
  if (requestUrl.searchParams.has("error") || !code) {
    return fail(requestUrl.searchParams.get("error") === "access_denied" ? "google-cancelled" : "google-unavailable");
  }

  const { clientId, clientSecret, redirectUri, appUrl } = readRequiredGoogleEnv(context);
  const signal = AbortSignal.timeout(10_000);
  onStage("token-exchange");
  const tokenResponse = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: "POST",
    signal,
    // Workers supports manual redirects. Treat any 3xx as a failed exchange
    // so credentials cannot be forwarded to a different destination.
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: stored.verifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Response("Google sign-in token exchange failed.", { status: 502 });
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: unknown } | null;

  if (typeof tokenPayload?.access_token !== "string" || !tokenPayload.access_token) {
    throw new Response("Google sign-in did not return an access token.", { status: 502 });
  }

  onStage("profile-lookup");
  const profileResponse = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    signal,
    redirect: "manual",
  });

  if (!profileResponse.ok) {
    throw new Response("Google profile lookup failed.", { status: 502 });
  }

  const profile = await profileResponse.json() as GoogleProfile;
  const email = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : "";

  // These accounts are linked by email, so Google must be authoritative for it.
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254 || profile.email_verified !== true ||
    (!email.endsWith("@gmail.com") && !(typeof profile.hd === "string" && profile.hd.trim()))) {
    return fail("google-email");
  }
  const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 200) || null : null;
  const picture = typeof profile.picture === "string" && profile.picture.startsWith("https://") && profile.picture.length <= 2048 ? profile.picture : null;
  onStage("database-config");
  const db = getDb();

  if (stored.mode === "admin") {
    onStage("admin-lookup");
    const adminUser = await retryDatabaseRead(() => findAdminUserByEmail(db, email));

    if (!adminUser?.active || !isAdminRole(adminUser.role)) {
      return fail("account-unavailable");
    }

    onStage("admin-session");
    return createAdminOAuthCompletionResponse({
      context,
      userId: adminUser.id,
      redirectTo: safeAdminReturnTo(stored.returnTo),
      appUrl,
      profile: { email, name, picture },
    });
  }

  onStage("customer-lookup");
  const findProfiles = (client: Pick<DatabaseClient, "query">) => client.query.users.findMany({
    where: sql`lower(btrim(${users.email})) = ${email}`,
    limit: 2,
  });
  let matches = await retryDatabaseRead(() => findProfiles(db));
  if (!matches.length) {
    onStage("customer-create");
    matches = await db.transaction(async tx => {
      // The schema permits duplicate emails. Serialize new Google profiles
      // for this email and recheck before inserting.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`edicut:google:${email}`}, 0))`);
      const concurrent = await findProfiles(tx);
      if (concurrent.length) return concurrent;
      return tx.insert(users).values({ email, name, profileImageUrl: picture, role: "customer" }).returning();
    });
  }
  const [user] = matches;
  if (matches.length !== 1 || !user?.active || user.deletedAt) return fail("account-unavailable");

  if ((!user.name && name) || (!user.profileImageUrl && picture)) {
    onStage("customer-profile");
    const [updated] = await db.update(users).set({
      name: sql`coalesce(nullif(${users.name}, ''), ${name})`,
      profileImageUrl: sql`coalesce(nullif(${users.profileImageUrl}, ''), ${picture})`,
      updatedAt: new Date(),
    }).where(and(eq(users.id, user.id), eq(users.active, true), isNull(users.deletedAt))).returning({ id: users.id });
    if (!updated) return fail("account-unavailable");
  }

  onStage("admin-lookup");
  const adminUser = await retryDatabaseRead(() => findAdminUserByEmail(db, email));
  const verifiedAdminIdentity = Boolean(adminUser?.active && isAdminRole(adminUser.role));
  onStage("customer-session");
  const destination = new URL(safeUserReturnTo(stored.returnTo), appUrl).href;
  const response = await createUserSession({
    request,
    context,
    userId: user.id,
    remember: true,
    redirectTo: destination,
    adminUserId: verifiedAdminIdentity ? adminUser?.id : undefined,
    adminAccessVerified: verifiedAdminIdentity,
  });

  const headers = new Headers(response.headers);
  headers.delete("Location");
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));
  return navigationPage(destination, "Opening your workspace", "Continue to your workspace", headers);
}

```


## Inactive sign-in tests

The previous live-flow test files are retained below for the future redesign reference.


### apps/web/app/routes/signin-account.server.test.ts
``ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  local: vi.fn(), admin: vi.fn(), enabled: vi.fn(), supabaseSignIn: vi.fn(), session: vi.fn(), captcha: vi.fn(),
  issueAuthCsrfToken: vi.fn(), verifyAuthCsrfToken: vi.fn(),
}));
vi.mock("@edicut/db/repositories/users", () => ({ findUserByEmail: mocks.local }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: mocks.admin }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({
  createUserSession: mocks.session,
  isAdminRole: (role: string) => role === "admin",
  issueAuthCsrfToken: mocks.issueAuthCsrfToken,
  verifyAuthCsrfToken: mocks.verifyAuthCsrfToken,
}));
vi.mock("../lib/password.server", () => ({ verifyPassword: async () => true }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.captcha }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", hashUsageLimitKey: async () => "identity-key", requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/auth.server", () => ({ supabaseAuthEnabled: mocks.enabled, signInWithSupabase: mocks.supabaseSignIn, signUpWithSupabase: vi.fn() }));
import { action } from "./signin";
const local = { id: "local-id", email: "client@example.com", active: true, deletedAt: null, passwordHash: "test-only-hash" };
function request(headers?: HeadersInit, body: BodyInit = new URLSearchParams({ intent: "signin", email: local.email, password: "test-password" })) {
  return new Request("http://localhost:3002/signin", { method: "POST", headers, body });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.local.mockResolvedValue(local); mocks.admin.mockResolvedValue(null); mocks.enabled.mockReturnValue(false);
  mocks.captcha.mockResolvedValue({ success: true });
  mocks.issueAuthCsrfToken.mockResolvedValue({ token: "refreshed-token", setCookie: "_edicut_auth_csrf=refreshed" });
  mocks.verifyAuthCsrfToken.mockResolvedValue(true);
  mocks.supabaseSignIn.mockResolvedValue({ error: "Invalid credentials." }); mocks.session.mockResolvedValue(new Response(null, { status: 302 }));
});
describe("customer sign-in account restrictions", () => {
  it("allows local sign-in without an external CAPTCHA token while keeping rate limiting", async () => {
    await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);

    expect(mocks.captcha).not.toHaveBeenCalled();
    expect(mocks.local).toHaveBeenCalledWith({}, local.email);
    expect(mocks.session).toHaveBeenCalledOnce();
  });
  it("still requires CAPTCHA for public sign-in hosts", async () => {
    mocks.captcha.mockResolvedValue({ success: false, error: "Security check failed. Please try again." });
    const publicRequest = new Request("https://edicut.com/signin", {
      method: "POST",
      headers: { Origin: "https://edicut.com" },
      body: new URLSearchParams({ intent: "signin", email: local.email, password: "test-password" }),
    });

    const result = await action({ request: publicRequest, context: {}, params: {} } as Parameters<typeof action>[0]);

    expect(mocks.captcha).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ error: "Security check failed. Please try again." });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it.each(["shortpass", "x".repeat(73), "বাংলা".repeat(8)])("rejects weak or truncated signup passwords before creating an account", async password => {
    const result = await action({ request: request(undefined, new URLSearchParams({ intent: "signup", email: local.email, password })), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error");
    expect(mocks.local).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not accept a stale local password after Supabase rejects it", async () => {
    mocks.enabled.mockReturnValue(true);
    const result = await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ error: "Invalid credentials." });
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("normalizes a backslash open redirect before creating a local session", async () => {
    await action({ request: request(undefined, new URLSearchParams({ intent: "signin", email: local.email, password: "test-password", redirectTo: "/\\attacker.test" })), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: "/dashboard" }));
  });
  it.each([false, true])("rejects disabled or trashed local accounts with Supabase enabled=%s", async enabled => {
    mocks.enabled.mockReturnValue(enabled);
    for (const record of [{ ...local, active: false }, { ...local, deletedAt: new Date() }]) {
      mocks.local.mockResolvedValue(record);
      const result = await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
      expect(result).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
    }
  });
  it("uses the existing local profile ID returned by authenticated Supabase lookup", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.supabaseSignIn.mockResolvedValue({ user: { id: "auth-id", email: local.email }, session: { access_token: "test-token", refresh_token: "test-refresh" }, profileId: local.id });
    await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ userId: local.id, accessToken: "test-token" }));
  });
  it("rejects an unverified login before looking up credentials", async () => {
    mocks.verifyAuthCsrfToken.mockResolvedValue(false);
    const result = await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ data: { error: "This sign-in form expired. Please try again." } });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before verifying the sign-in token", async () => {
    const result = await action({ request: request({ Origin: "https://other.example" }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ status: 403 });
    expect(mocks.verifyAuthCsrfToken).not.toHaveBeenCalled();
  });
  it("rejects malformed login bodies without a parser exception", async () => {
    const result = await action({ request: request({ "Content-Type": "multipart/form-data; boundary=invalid" }, "malformed"), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
  });
});

``

### apps/web/app/routes/signin-usage-protection.server.test.ts
``ts
import { describe, expect, it, vi } from "vitest";
import { action } from "./signin";
import { issueAuthCsrfToken } from "../lib/session.server";

describe("sign-in identity protection", () => {
  it("shares one per-email limit across sign-in and sign-up intents", async () => {
    const counts = new Map<string, number>();
    const limit = vi.fn(async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= 5 };
    });
    const context = {
      cf: {
        env: {
          SESSION_SECRET: "fixture-session-secret",
          AUTH_IDENTITY_LIMITER: { limit },
          NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "test-site-key",
          RECAPTCHA_SECRET_KEY: "test-secret",
        },
      },
    };
    const csrf = await issueAuthCsrfToken(new Request("https://edicut.com/signin"), context);
    const results: Array<Record<string, unknown>> = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const form = new FormData();
      form.set("intent", attempt % 2 === 0 ? "signin" : "signup");
      form.set("email", "  Limit@Example.com ");
      form.set("password", "not-a-real-password");
      form.set("csrfToken", csrf.token);
      const request = new Request("https://edicut.com/signin", {
        method: "POST",
        headers: { Origin: "https://edicut.com", Cookie: csrf.setCookie!.split(";")[0] },
        body: form,
      });

      results.push(await action({ request, context, params: {} } as Parameters<typeof action>[0]) as Record<string, unknown>);
    }

    expect(limit).toHaveBeenCalledTimes(6);
    expect(new Set(limit.mock.calls.map(([input]) => input.key)).size).toBe(1);
    expect(results.slice(0, 5).every((result) => String(result.error).includes("Security check expired"))).toBe(true);
    expect(results[5].error).toBe("Too many attempts for this account. Wait a minute and try again.");
  });
});

``

### apps/web/app/routes/auth-google.server.test.ts
``ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startGoogleOAuth: vi.fn(),
  verifyRecaptchaToken: vi.fn(),
  issueAuthCsrfToken: vi.fn(),
  verifyAuthCsrfToken: vi.fn(),
}));

vi.mock("../lib/google-auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/google-auth.server")>(),
  startGoogleOAuth: mocks.startGoogleOAuth,
}));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.verifyRecaptchaToken }));
vi.mock("../lib/session.server", () => ({
  issueAuthCsrfToken: mocks.issueAuthCsrfToken,
  verifyAuthCsrfToken: mocks.verifyAuthCsrfToken,
}));

import { action, loader } from "./auth-google";

function args(values: Record<string, string> = {}, url = "http://localhost:3002/auth/google") {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  const request = new Request(url, { method: "POST", body: formData, headers: { Origin: new URL(url).origin } });
  return { request, params: {}, context: {} } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.issueAuthCsrfToken.mockResolvedValue({ token: "refreshed-token", setCookie: "_edicut_auth_csrf=refreshed" });
  mocks.verifyAuthCsrfToken.mockResolvedValue(true);
  mocks.verifyRecaptchaToken.mockResolvedValue({ success: true });
  mocks.startGoogleOAuth.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://accounts.google.com/" } }));
});

describe("Google OAuth GET navigation", () => {
  function get(query = "") {
    return loader({ request: new Request(`http://localhost:3002/auth/google${query}`), params: {}, context: {} } as Parameters<typeof loader>[0]);
  }

  it("redirects a direct visit to sign-in without bypassing the CAPTCHA", () => {
    const response = get();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signin");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("preserves the user's destination", () => {
    expect(get("?returnTo=%2Fdashboard%2Fprojects%3Fpage%3D2").headers.get("Location"))
      .toBe("/signin?redirectTo=%2Fdashboard%2Fprojects%3Fpage%3D2");
  });

  it("returns admins to the admin login", () => {
    expect(get("?mode=admin&returnTo=%2Fsite%2Fnode-logmin%2Fusers").headers.get("Location"))
      .toBe("/site/node-logmin/login?redirectTo=%2Fsite%2Fnode-logmin%2Fusers");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "/\n/example.com"])
    ("discards unsafe return paths: %s", (returnTo) => {
      expect(get(`?returnTo=${encodeURIComponent(returnTo)}`).headers.get("Location")).toBe("/signin");
    });
});

describe("Google OAuth initiation", () => {
  it("rejects a foreign Origin before reading or validating the form", async () => {
    const { request, ...rest } = args({ mode: "user" });
    request.headers.set("Origin", "https://foreign.example");
    expect((await action({ request, ...rest }) as Response).status).toBe(403);
    expect(mocks.verifyAuthCsrfToken).not.toHaveBeenCalled();
  });
  it("starts user OAuth without requiring a CAPTCHA token", async () => {
    const result = await action(args({ mode: "user" }));

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("accepts the browser-native URL-encoded OAuth form", async () => {
    const request = new Request("http://localhost:3002/auth/google", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3002",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ mode: "user", returnTo: "/dashboard" }),
    });

    await action({ request, params: {}, context: {} } as Parameters<typeof action>[0]);

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(mocks.startGoogleOAuth.mock.calls[0]?.[2]?.get("returnTo")).toBe("/dashboard");
  });

  it("requires CAPTCHA verification for admin OAuth", async () => {
    const result = await action(args({ mode: "admin", "g-recaptcha-response": "verified-token" }, "https://edicut.com/auth/google"));

    expect(mocks.verifyRecaptchaToken).toHaveBeenCalledWith({ context: {}, token: "verified-token" });
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("keeps local admin OAuth testable without an external CAPTCHA token", async () => {
    const result = await action(args({ mode: "admin" }));

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("returns admins to their login form when CAPTCHA verification fails", async () => {
    mocks.verifyRecaptchaToken.mockResolvedValue({ success: false, error: "Security check failed." });
    const result = await action(args({ mode: "admin", returnTo: "/site/node-logmin/users", "g-recaptcha-response": "bad-token" }, "https://edicut.com/auth/google"));

    expect((result as Response).headers.get("Location"))
      .toBe("/site/node-logmin/login?error=recaptcha&redirectTo=%2Fsite%2Fnode-logmin%2Fusers");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("rejects an OAuth request without its form token and returns the user to sign-in", async () => {
    mocks.verifyAuthCsrfToken.mockResolvedValue(false);
    const result = await action(args({ mode: "user" }));

    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/signin?error=auth-request");
    expect((result as Response).headers.get("Set-Cookie")).toContain("_edicut_auth_csrf=refreshed");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });
});

``

### apps/web/app/routes/auth-google-callback.server.test.ts
``ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), complete: vi.fn(), failure: vi.fn() }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.db }));
vi.mock("../lib/google-auth.server", () => ({ completeGoogleOAuth: mocks.complete, createGoogleOAuthFailureResponse: mocks.failure }));
import { loader } from "./auth-google-callback";

const request = new Request("http://localhost:3002/api/auth/callback/google?code=private-code&state=private-state");
const args = { request, params: {}, context: {} } as Parameters<typeof loader>[0];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.db.mockReturnValue({});
  mocks.failure.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/signin?error=google-unavailable" } }));
});
afterEach(() => vi.restoreAllMocks());

describe("Google callback failure handling", () => {
  it("preserves a successful sign-in response", async () => {
    const response = new Response(null, { status: 302, headers: { Location: "/dashboard", "Set-Cookie": "_session=authenticated" } });
    mocks.complete.mockResolvedValue(response);
    expect(await loader(args)).toBe(response);
    expect(mocks.failure).not.toHaveBeenCalled();
  });

  it("does not expose failed queries, profile data, or OAuth credentials", async () => {
    mocks.complete.mockRejectedValue(new Error('Failed query: update "users" returning "session_version"; params: private-email@example.com, private-token'));
    const response = await loader(args);
    expect(response.headers.get("Location")).toBe("/signin?error=google-unavailable");
    expect(await response.text()).toBe("");
    expect(mocks.failure).toHaveBeenCalledWith(request, args.context);
    expect(console.error).toHaveBeenCalledWith("Google sign-in could not be completed.", { status: 500, stage: "transaction" });
  });

  it("also handles database initialization failures", async () => {
    mocks.db.mockImplementation(() => { throw new Error("private connection details"); });
    mocks.complete.mockImplementation((_request, _context, getDb, stage) => {
      stage("database-config");
      return getDb();
    });
    expect((await loader(args)).status).toBe(302);
    expect(console.error).toHaveBeenCalledWith("Google sign-in could not be completed.", { status: 500, stage: "database-config" });
  });

  it("returns provider outages to a fresh sign-in attempt", async () => {
    mocks.complete.mockRejectedValue(new Response("Token exchange failed", { status: 502 }));
    expect((await loader(args)).headers.get("Location")).toBe("/signin?error=google-unavailable");
    expect(console.error).toHaveBeenCalledWith("Google sign-in could not be completed.", { status: 502, stage: "transaction" });
  });

  it.each([302, 403])("preserves intentional %s responses without bypassing access controls", async status => {
    const response = new Response(null, { status });
    mocks.complete.mockRejectedValue(response);
    await expect(loader(args)).rejects.toBe(response);
    expect(mocks.failure).not.toHaveBeenCalled();
  });
});

``

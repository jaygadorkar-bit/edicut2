import type { ActionFunctionArgs, MetaFunction } from "react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { Form, Link, useActionData, useNavigation, useSearchParams, useSubmit } from "react-router";
import { KeyRound } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { resolveWebEnv } from "../lib/context.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { executeInvisibleRecaptcha } from "../lib/recaptcha.client";
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
  const redirectTo = sanitizeRedirect(searchParams.get("redirectTo") || "/dashboard");
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

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

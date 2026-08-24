import { useEffect, useState } from "react";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useSearchParams, useNavigation } from "react-router";
import { getSupabaseClient } from "../integrations/supabase/client.server";

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
];

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const accessToken = formData.get("accessToken");
  const refreshToken = formData.get("refreshToken");
  const code = formData.get("code");

  if (typeof password !== "string" || password.length < 6) {
    return { error: "Your new password must be at least 6 characters long." } satisfies UpdatePasswordActionData;
  }

  if (password !== confirmPassword) {
    return { error: "The passwords do not match." } satisfies UpdatePasswordActionData;
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

    const { error } = await updateClient.auth.updateUser({ password });
    if (error) {
      return { error: "We could not update your password. Request a new reset link and try again." } satisfies UpdatePasswordActionData;
    }
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
              <span className="h-2 w-2 rounded-full bg-primary" />
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
                  minLength={6}
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
                  minLength={6}
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

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
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[560px] items-center justify-center rounded-[28px] bg-white px-6 py-10 shadow-2xl sm:px-12">
        <section className="w-full">
          <Link to="/signin" className="inline-flex items-center gap-2 text-xs font-black text-gray-500 transition hover:text-black">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to sign in
          </Link>

          <div className="mt-10">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Account recovery</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-black">Choose a new password</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Set a new password for your EdiCut account, then sign in again.
            </p>
          </div>

          {!hasRecoveryToken ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
              Open the password reset link from your email to continue. If it has expired, request a new link.
            </div>
          ) : (
            <Form method="post" className="mt-8 grid gap-4">
              {actionData?.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {actionData.error}
                </div>
              ) : null}

              <input type="hidden" name="accessToken" value={tokens.accessToken} />
              <input type="hidden" name="refreshToken" value={tokens.refreshToken} />
              <input type="hidden" name="code" value={code} />

              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">New password</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="h-12 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-black focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">Confirm password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="h-12 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-black focus:ring-2 focus:ring-red-100"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white transition hover:bg-[#cf141b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                {submitting ? "Updating password..." : "Update password"}
              </button>
            </Form>
          )}
        </section>
      </div>
    </main>
  );
}

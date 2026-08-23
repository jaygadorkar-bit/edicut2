import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { resolveWebEnv } from "../lib/context.server";

type ForgotPasswordActionData = {
  error?: string;
  sent?: boolean;
};

export const meta: MetaFunction = () => [
  { title: "Reset password - EdiCut" },
  { name: "description", content: "Request a secure EdiCut password reset link." },
];

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const emailValue = formData.get("email");

  if (typeof emailValue !== "string" || !emailValue.trim() || !emailValue.includes("@")) {
    return { error: "Enter the email address for your EdiCut account." } satisfies ForgotPasswordActionData;
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
  const redirectTo = sanitizeRedirect(searchParams.get("redirectTo") || "/dashboard");
  const submitting = navigation.state !== "idle";

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[560px] items-center justify-center rounded-[28px] bg-white px-6 py-10 shadow-2xl sm:px-12">
        <section className="w-full">
          <Link to={`/signin?redirectTo=${encodeURIComponent(redirectTo)}`} className="inline-flex items-center gap-2 text-xs font-black text-gray-500 transition hover:text-black">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to sign in
          </Link>

          <div className="mt-10">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Account recovery</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-black">Reset your password</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Enter your account email and we’ll send a secure link to choose a new password.
            </p>
          </div>

          {actionData?.sent ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
              If an account matches that email, a password reset link is on its way. Check your inbox and spam folder.
            </div>
          ) : (
            <Form method="post" className="mt-8 grid gap-4">
              {actionData?.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {actionData.error}
                </div>
              ) : null}

              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="h-12 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-black focus:ring-2 focus:ring-red-100"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white transition hover:bg-[#cf141b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">mail</span>
                {submitting ? "Sending link..." : "Send reset link"}
              </button>
            </Form>
          )}

          {actionData?.sent ? (
            <Link to={`/signin?redirectTo=${encodeURIComponent(redirectTo)}`} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl border border-gray-300 text-sm font-black text-black transition hover:border-black">
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

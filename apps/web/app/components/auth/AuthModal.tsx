import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { executeInvisibleRecaptcha } from "../../lib/recaptcha.client";

type AuthMode = "signin" | "signup";

type AuthActionData = {
  error?: string;
  intent?: string;
};

export function authHref(_pathname: string, _search: string, mode: AuthMode = "signin", redirectTo = "/dashboard") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("redirectTo", redirectTo);
  return `/signin?${params.toString()}`;
}

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<AuthActionData>();
  const requestedMode = searchParams.get("mode") || searchParams.get("auth");
  const redirectTo = sanitizeRedirect(searchParams.get("redirectTo") || "/dashboard");
  const resetComplete = searchParams.get("reset") === "success";
  const [mode, setMode] = useState<AuthMode>(requestedMode === "signup" ? "signup" : "signin");
  const [showPassword, setShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const googleFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (requestedMode === "signup") setMode("signup");
    if (requestedMode === "signin") setMode("signin");
  }, [requestedMode]);

  const error = fetcher.data?.intent === mode ? fetcher.data.error : undefined;
  const visibleError = securityError || error;
  const submitting = fetcher.state !== "idle";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    setSecurityError(null);

    try {
      const formData = new FormData(form);
      formData.set("g-recaptcha-response", await executeInvisibleRecaptcha(form, mode === "signup" ? "dashboard_signup" : "dashboard_signin"));
      fetcher.submit(formData, { method: "post", action: "/signin" });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    }
  }

  async function handleGoogleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    setSecurityError(null);
    setGoogleSubmitting(true);

    try {
      await executeInvisibleRecaptcha(form, "google_signin");
      HTMLFormElement.prototype.submit.call(form);
    } catch (error) {
      setGoogleSubmitting(false);
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-3 py-4 text-foreground sm:px-6 sm:py-6 lg:px-8 lg:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1080px] items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)] sm:rounded-[28px] lg:min-h-[calc(100vh-5rem)] lg:grid-cols-2">
        <section className="relative hidden min-h-[680px] overflow-hidden bg-[#e8ecec] lg:block">
          <img
            src="/images/light-hero.png"
            alt="Minimal video production studio with camera and editing workstation"
            className="auth-scene-image absolute inset-0 h-full w-full object-cover"
          />
          <div className="auth-scene-vignette absolute inset-0" />
          <div className="auth-scene-grid absolute inset-0 opacity-20" />
          <div className="auth-scene-orb auth-scene-orb-one absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="auth-scene-orb auth-scene-orb-two absolute -right-28 bottom-24 h-80 w-80 rounded-full bg-white/35 blur-3xl" />
          <Link to="/" className="absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/75 px-3 py-2 text-xs font-black text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-black" aria-label="Back to home">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to home
          </Link>
        </section>

        <section className="mx-auto w-full max-w-[640px] overflow-y-auto px-5 py-6 sm:px-10 sm:py-10 lg:max-w-none lg:px-10 lg:py-8">
          <div className="mb-6 flex lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-black text-gray-500 transition hover:text-black" aria-label="Back to home">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to home
            </Link>
          </div>

          <div className="grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-black" role="tablist" aria-label="Authentication">
            {[
              ["signin", "Sign in"],
              ["signup", "Sign up"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value as AuthMode)}
                role="tab"
                aria-selected={mode === value}
                className={`rounded-full px-4 py-3 transition ${mode === value ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form ref={googleFormRef} method="post" action="/auth/google" onSubmit={handleGoogleSubmit} className="mt-8">
            <input type="hidden" name="returnTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            <button
              type="submit"
              disabled={googleSubmitting || submitting}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white text-sm font-black transition hover:border-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <img src="/icons/google-flat.svg" alt="" className="h-5 w-5" />
              {googleSubmitting ? "Checking security..." : "Continue with Google"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <div className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">or</div>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {visibleError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {visibleError}
            </div>
          ) : null}

          {resetComplete ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              Your password has been updated. Sign in with your new password.
            </div>
          ) : null}

          <fetcher.Form method="post" action="/signin" className="grid gap-4" onSubmit={handleSubmit}>
            <input type="hidden" name="intent" value={mode} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            {mode === "signup" ? <AuthField label="Full name" name="name" /> : null}
            <AuthField label="Email" name="email" type="email" />
            <PasswordField
              label="Password"
              name="password"
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
            {mode === "signup" ? <input type="hidden" name="remember" value="on" /> : (
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
                  <input type="checkbox" name="remember" className="h-4 w-4 rounded accent-red-600" />
                  Remember me
                </label>
                <Link
                  to={`/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className="text-sm font-black text-primary"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white transition hover:bg-[#cf141b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">{mode === "signup" ? "person_add" : "login"}</span>
              {submitting ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </fetcher.Form>

          <p className="mt-6 text-xs font-medium leading-5 text-gray-500">
            By continuing, you agree to the EdiCut <a className="font-black text-black underline" href="/terms">Terms</a> and acknowledge our <a className="font-black text-black underline" href="/privacy">Privacy Policy</a>.
          </p>
        </section>
      </div>
    </main>
  );
}

function AuthField({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  const autoComplete = name === "name" ? "name" : name === "email" ? "email" : undefined;

  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-black focus:ring-2 focus:ring-red-100"
      />
    </label>
  );
}

function PasswordField({ label, name, show, onToggle }: { label: string; name: string; show: boolean; onToggle: () => void }) {
  return (
    <label className="relative grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        autoComplete={name === "confirmPassword" ? "new-password" : "current-password"}
        className="h-11 rounded-xl border border-gray-300 bg-white px-3 pr-10 text-sm font-bold outline-none transition focus:border-black focus:ring-2 focus:ring-red-100"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute bottom-2.5 right-3 text-gray-500 transition hover:text-black"
        aria-label={show ? "Hide password" : "Show password"}
      >
        <span className="material-symbols-outlined text-[20px]">{show ? "visibility_off" : "visibility"}</span>
      </button>
    </label>
  );
}

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

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
      formData.set(
        "g-recaptcha-response",
        await executeInvisibleRecaptcha(form, mode === "signup" ? "dashboard_signup" : "dashboard_signin")
      );
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
    <main className="min-h-screen neo-home flex items-center justify-center px-3 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1080px] items-stretch overflow-hidden rounded-[2.5rem] neo-surface shadow-2xl lg:grid-cols-2">
        {/* Left Side: Editorial Creator Visual Scene */}
        <section className="relative hidden min-h-[640px] overflow-hidden bg-[#e8ecec] lg:block">
          <img
            src="/images/light-hero.png"
            alt="Minimal video production studio with camera and editing workstation"
            className="auth-scene-image absolute inset-0 h-full w-full object-cover"
          />
          <div className="auth-scene-vignette absolute inset-0" />
          <div className="auth-scene-grid absolute inset-0 opacity-20" />
          <div className="auth-scene-orb auth-scene-orb-one absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="auth-scene-orb auth-scene-orb-two absolute -right-28 bottom-24 h-80 w-80 rounded-full bg-white/35 blur-3xl" />
          
          <Link
            to="/"
            className="neo-pill absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black neo-ink transition hover:scale-105"
            aria-label="Back to home"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to home
          </Link>

          <div className="absolute bottom-8 left-8 right-8 z-10 neo-card rounded-2xl p-5 backdrop-blur-md bg-white/80">
            <p className="yt-tag neo-section-label">Creator Workspace</p>
            <p className="mt-1 text-base font-black neo-ink">Direct collaboration with your lead editor & PM.</p>
          </div>
        </section>

        {/* Right Side: Tactile Neo Auth Form */}
        <section className="mx-auto w-full max-w-[640px] overflow-y-auto px-6 py-8 sm:px-12 sm:py-12 lg:max-w-none lg:px-12 lg:py-10">
          <div className="mb-6 flex lg:hidden">
            <Link
              to="/"
              className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black neo-muted transition hover:text-black"
              aria-label="Back to home"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to home
            </Link>
          </div>

          <div>
            <span className="neo-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black uppercase tracking-wider neo-section-label">
              <span className="h-2 w-2 rounded-full bg-primary" />
              EdiCut Account
            </span>
            <h1 className="yt-title mt-3 font-black neo-ink">
              {mode === "signup" ? "Create creator account" : "Welcome back"}
            </h1>
            <p className="mt-1 text-xs font-medium neo-muted">
              {mode === "signup"
                ? "Start submitting raw footage and managing YouTube edits."
                : "Sign in to your client dashboard to view active deliverables."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="neo-inset mt-6 grid grid-cols-2 rounded-full p-1.5" role="tablist" aria-label="Authentication">
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
                className={`rounded-full py-2.5 text-xs font-black uppercase tracking-wider transition ${
                  mode === value
                    ? "bg-white text-black shadow-md shadow-black/10"
                    : "neo-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Google Auth Button */}
          <form ref={googleFormRef} method="post" action="/auth/google" onSubmit={handleGoogleSubmit} className="mt-6">
            <input type="hidden" name="returnTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            <button
              type="submit"
              disabled={googleSubmitting || submitting}
              className="neo-card flex h-12 w-full items-center justify-center gap-3 rounded-2xl text-xs font-black uppercase tracking-wider neo-ink transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <img src="/icons/google-flat.svg" alt="" className="h-4 w-4" />
              {googleSubmitting ? "Checking security..." : "Continue with Google"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 neo-line border-b" />
            <div className="text-[11px] font-black uppercase tracking-[0.18em] neo-muted">or continue with email</div>
            <div className="h-px flex-1 neo-line border-b" />
          </div>

          {visibleError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              {visibleError}
            </div>
          ) : null}

          {resetComplete ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
              Your password has been updated. Sign in with your new password.
            </div>
          ) : null}

          {/* Main Credentials Form */}
          <fetcher.Form method="post" action="/signin" className="grid gap-4" onSubmit={handleSubmit}>
            <input type="hidden" name="intent" value={mode} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="g-recaptcha-response" value="" />
            {mode === "signup" ? <AuthField label="Full name" name="name" placeholder="Alex Rivers" /> : null}
            <AuthField label="Email address" name="email" type="email" placeholder="alex@creator.com" />
            <PasswordField
              label="Password"
              name="password"
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
            {mode === "signup" ? (
              <input type="hidden" name="remember" value="on" />
            ) : (
              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-bold neo-muted cursor-pointer">
                  <input type="checkbox" name="remember" className="h-3.5 w-3.5 accent-red-600 rounded" />
                  Remember me
                </label>
                <Link
                  to={`/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className="text-xs font-black text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="neo-button neo-button--primary mt-2 w-full justify-center text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">{mode === "signup" ? "person_add" : "login"}</span>
              <span>{submitting ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}</span>
            </button>
          </fetcher.Form>

          <p className="mt-6 text-center text-[11px] font-medium leading-5 neo-muted">
            By continuing, you agree to the EdiCut{" "}
            <Link className="font-black neo-ink underline" to="/terms">
              Terms
            </Link>{" "}
            and acknowledge our{" "}
            <Link className="font-black neo-ink underline" to="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
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
    <label className="grid gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] neo-muted">{label}</span>
      <input
        name={name}
        type={type}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="neo-inset h-11 rounded-xl px-3.5 text-sm font-bold outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function PasswordField({
  label,
  name,
  show,
  onToggle,
}: {
  label: string;
  name: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="relative grid gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] neo-muted">{label}</span>
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        placeholder="••••••••"
        autoComplete={name === "confirmPassword" ? "new-password" : "current-password"}
        className="neo-inset h-11 rounded-xl px-3.5 pr-10 text-sm font-bold outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute bottom-2.5 right-3 text-gray-400 transition hover:text-black"
        aria-label={show ? "Hide password" : "Show password"}
      >
        <span className="material-symbols-outlined text-[18px]">{show ? "visibility_off" : "visibility"}</span>
      </button>
    </label>
  );
}

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

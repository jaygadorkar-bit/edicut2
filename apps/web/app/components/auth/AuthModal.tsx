import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
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
  const mode: AuthMode = requestedMode === "signup" ? "signup" : "signin";
  const [showPassword, setShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const error = fetcher.data?.intent === mode ? fetcher.data.error : undefined;
  const googleStateError = searchParams.get("error") === "google-state"
    ? "Google sign-in expired or could not be verified. Please try again."
    : undefined;
  const visibleError = securityError || error || googleStateError;
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
      formData.set(
        "g-recaptcha-response",
        await executeInvisibleRecaptcha(form, mode === "signup" ? "dashboard_signup" : "dashboard_signin")
      );
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
            <a href={`/auth/google?returnTo=${encodeURIComponent(redirectTo)}`} className="auth-button auth-button--link">
              <img src="/icons/google-g.png" alt="" width="200" height="204" className="auth-google-icon" />
              <span>Continue with Google</span>
            </a>
          </div>

          <div className="auth-divider" aria-hidden="true"><span>or</span></div>

          {visibleError ? (
            <p id="auth-feedback" className="auth-alert auth-alert--error" role="alert">{visibleError}</p>
          ) : null}
          {resetComplete ? (
            <p className="auth-alert auth-alert--success" role="status">Your password has been updated. Sign in with your new password.</p>
          ) : null}

          <fetcher.Form method="post" action="/signin" className="auth-form" onSubmit={handleSubmit} aria-busy={emailChecking || submitting} aria-describedby={visibleError ? "auth-feedback" : undefined}>
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
          minLength={6}
          placeholder={autoComplete === "new-password" ? "At least 6 characters" : "Enter your password"}
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

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useLocation, useNavigate, useSearchParams } from "react-router";
import { executeInvisibleRecaptcha } from "../../lib/recaptcha.client";

type AuthMode = "signin" | "signup";

type AuthActionData = {
  error?: string;
  intent?: string;
};

export function authHref(pathname: string, search: string, mode: AuthMode = "signin", redirectTo = "/dashboard") {
  const params = new URLSearchParams(search);
  params.set("auth", mode);
  params.set("redirectTo", redirectTo);
  return `${pathname}?${params.toString()}`;
}

export function AuthModal() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<AuthActionData>();
  const requestedMode = searchParams.get("auth");
  const redirectTo = sanitizeRedirect(searchParams.get("redirectTo") || "/dashboard");
  const isOpen = requestedMode === "signin" || requestedMode === "signup";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  useEffect(() => {
    if (requestedMode === "signup") setMode("signup");
    if (requestedMode === "signin") setMode("signin");
  }, [requestedMode]);

  const closeHref = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("auth");
    params.delete("redirectTo");
    const query = params.toString();
    return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-3 py-4 sm:px-5 sm:py-8" role="dialog" aria-modal="true" aria-label="EdiCut authentication">
      <div className="relative grid max-h-[94vh] w-full max-w-[980px] overflow-hidden rounded-[28px] bg-white shadow-2xl md:grid-cols-[0.78fr_1fr]">
        <button
          type="button"
          onClick={() => navigate(closeHref)}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/90 text-gray-500 transition hover:border-black hover:text-black"
          aria-label="Close auth modal"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <section className="hidden bg-[#111111] p-8 text-white md:flex md:flex-col md:justify-between lg:p-10">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label="EdiCut home">
              <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-10 w-auto" />
            </Link>

            <h2 className="mt-12 max-w-sm text-4xl font-black leading-tight tracking-tight">Scale your edits without living in the timeline.</h2>
            <ul className="mt-7 grid gap-4 text-sm font-black">
              {["Unlimited revisions", "24-hour turnaround", "Pro editor match"].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-black p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">timeline proof</span>
              <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em]">Live</span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["Video", "w-2/3 bg-white/20", "w-1/4 bg-white/10"],
                ["Audio", "w-4/5 bg-primary/70", "w-1/6 bg-primary/30"],
                ["Notes", "w-1/2 bg-white/20", "w-1/3 bg-white/10"],
              ].map(([label, first, second]) => (
                <div key={label} className="grid grid-cols-[62px_1fr] items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">{label}</span>
                  <div className="flex h-8 items-center gap-2">
                    <div className={`h-6 rounded-md ${first}`} />
                    <div className={`h-6 rounded-md ${second}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-h-[94vh] overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          <div className="pr-10 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2" aria-label="EdiCut home">
              <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-9 w-auto" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-black md:mt-0" role="tablist" aria-label="Authentication">
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

          <div className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">{mode === "signin" ? "Welcome back" : "Start your workspace"}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{mode === "signin" ? "Sign in to EdiCut" : "Create your account"}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
              {mode === "signin" ? "Access your projects, messages, and editing dashboard." : "Set up your editing portal and send your first brief."}
            </p>
          </div>

          <a href="/auth/google" className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white text-sm font-black transition hover:border-black">
            <img src="/icons/google-flat.svg" alt="" className="h-5 w-5" />
            Continue with Google
          </a>

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
                <a href="#" className="text-sm font-black text-primary">Forgot password?</a>
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
    </div>
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

import { useEffect, useState } from "react";
import { Link } from "react-router";

const CONSENT_STORAGE_KEY = "edicut-cookie-consent-v1";

type ConsentState = {
  analytics: boolean;
  marketing: boolean;
};

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ConsentState>;
        setAnalytics(parsed.analytics === true);
        setMarketing(parsed.marketing === true);
      } else {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    } finally {
      setIsReady(true);
    }
  }, []);

  function saveConsent(next: ConsentState) {
    try {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ ...next, savedAt: new Date().toISOString() }),
      );
    } catch {
      // The choice still applies for the current page when storage is unavailable.
    }

    setAnalytics(next.analytics);
    setMarketing(next.marketing);
    setIsVisible(false);
    setIsManaging(false);
  }

  if (!isReady || !isVisible) return null;

  return (
    <aside
      className="fixed bottom-4 right-4 z-[90] w-[min(31rem,calc(100vw-2rem))] rounded-[1.25rem] border border-slate-200 bg-[#fbfcf7] p-5 text-slate-950 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.45)] sm:bottom-6 sm:right-6 sm:p-6"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      {!isManaging ? (
        <>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 text-[22px] text-slate-700" aria-hidden="true">cookie</span>
            <div>
              <h2 id="cookie-consent-title" className="text-lg font-black tracking-tight">Helping your journey stay smooth</h2>
              <p id="cookie-consent-description" className="mt-3 text-sm leading-6 text-slate-700">
                We use cookies to make the site work and to understand how visitors use EdiCut. You can reject optional cookies or manage your preferences. See our{" "}
                <Link to="/privacy" className="font-bold underline underline-offset-2 hover:text-primary">Cookie Policy</Link>{" "}for more details.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => saveConsent({ analytics: false, marketing: false })}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-950 bg-transparent px-4 py-3 text-center text-sm font-black transition hover:bg-slate-100"
            >
              Reject non-essential
            </button>
            <button
              type="button"
              onClick={() => saveConsent({ analytics: true, marketing: true })}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800"
            >
              Accept all cookies
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsManaging(true)}
            className="mt-5 text-left text-sm font-bold text-slate-900 underline underline-offset-4 transition hover:text-primary"
          >
            Manage preferences
          </button>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Cookie settings</p>
              <h2 id="cookie-consent-title" className="mt-2 text-xl font-black tracking-tight">Choose what EdiCut can use</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsManaging(false)}
              className="rounded-full px-2 py-1 text-sm font-bold text-slate-500 underline underline-offset-2 hover:text-slate-950"
            >
              Back
            </button>
          </div>

          <p id="cookie-consent-description" className="mt-3 text-sm leading-6 text-slate-700">
            Essential cookies keep the site secure and working. Optional cookies help us improve the experience and measure campaigns.
          </p>

          <div className="mt-5 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            <CookiePreferenceRow label="Essential cookies" description="Always active for security, sign-in, and core site features." checked disabled onChange={() => undefined} />
            <CookiePreferenceRow label="Analytics cookies" description="Help us understand which pages and features are useful." checked={analytics} onChange={setAnalytics} />
            <CookiePreferenceRow label="Marketing cookies" description="Help measure campaigns and show more relevant promotions." checked={marketing} onChange={setMarketing} />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => saveConsent({ analytics: false, marketing: false })}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-950 px-4 py-3 text-sm font-black transition hover:bg-slate-100"
            >
              Reject optional
            </button>
            <button
              type="button"
              onClick={() => saveConsent({ analytics, marketing })}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Save preferences
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function CookiePreferenceRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 accent-slate-950 disabled:opacity-60"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>
      </span>
      {disabled ? <span className="text-xs font-black text-slate-500">Required</span> : null}
    </label>
  );
}

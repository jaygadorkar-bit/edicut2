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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_STORAGE_KEY);

      if (saved) {
        JSON.parse(saved);
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

    setIsVisible(false);
  }

  if (!isReady || !isVisible) return null;

  return (
    <aside
      className="fixed bottom-3 right-3 z-[90] w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-3 text-[var(--neo-ink)] shadow-[0_20px_55px_-24px_var(--neo-shadow-dark)] sm:bottom-4 sm:right-4 lg:left-4 lg:right-auto"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <>
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--neo-muted)]" aria-hidden="true">cookie</span>
          <div className="min-w-0 flex-1">
            <h2 id="cookie-consent-title" className="text-sm font-black tracking-tight sm:text-base">We value your privacy</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            aria-label="Close cookie notice"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--neo-muted)] transition-colors hover:text-[var(--neo-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neo-muted)]"
          >
            <span className="material-symbols-outlined text-sm sm:text-base" aria-hidden="true">close</span>
          </button>
        </div>

        <p id="cookie-consent-description" className="mt-0.5 text-xs leading-4 text-[var(--neo-muted)]">
          Essential cookies run the site. Optional cookies help us improve it. Read our{" "}
          <Link to="/privacy" className="font-bold underline underline-offset-2 hover:text-primary">Cookie Policy</Link>.
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => saveConsent({ analytics: false, marketing: false })}
            className="neo-button neo-button--pill w-full min-w-0 whitespace-normal !min-h-11 !px-1 !py-2 !text-xs !leading-4"
          >
            Accept essential
          </button>
          <button
            type="button"
            onClick={() => saveConsent({ analytics: true, marketing: true })}
            className="neo-button neo-button--pill w-full min-w-0 whitespace-normal !min-h-11 !px-1 !py-2 !text-xs !leading-4"
          >
            Accept all
          </button>
        </div>
      </>
    </aside>
  );
}

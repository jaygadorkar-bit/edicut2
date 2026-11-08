import { useEffect, useState } from "react";
import { Link } from "react-router";
import { setSiteAnalyticsConsent, SITE_ANALYTICS_CONSENT_KEY } from "../../lib/site-analytics";

type ConsentState = {
  analytics: boolean;
  marketing: boolean;
};

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SITE_ANALYTICS_CONSENT_KEY);

      if (saved) {
        const consent = JSON.parse(saved) as Partial<ConsentState> | null;
        if (
          consent &&
          typeof consent.analytics === "boolean" &&
          typeof consent.marketing === "boolean"
        ) {
          setSiteAnalyticsConsent(consent.analytics);
          document.documentElement.dataset.edicutConsent = "saved";
          setIsVisible(false);
          return;
        }
      }
      document.documentElement.removeAttribute("data-edicut-consent");
    } catch {
      document.documentElement.removeAttribute("data-edicut-consent");
    }

    setSiteAnalyticsConsent(false);
    setIsVisible(true);
  }, []);

  function saveConsent(next: ConsentState) {
    try {
      window.localStorage.setItem(
        SITE_ANALYTICS_CONSENT_KEY,
        JSON.stringify({ ...next, savedAt: new Date().toISOString() }),
      );
    } catch {
      // The choice still applies for the current page when storage is unavailable.
    }

    setSiteAnalyticsConsent(next.analytics);
    document.documentElement.dataset.edicutConsent = "saved";
    window.dispatchEvent(new Event("edicut:consent-change"));
    setIsVisible(false);
  }

  if (!isVisible) return null;

  return (
    <aside
      id="edicut-cookie-consent"
      className="fixed bottom-3 right-3 z-[90] w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-3 text-[var(--neo-ink)] shadow-[0_20px_55px_-24px_var(--neo-shadow-dark)] sm:bottom-4 sm:right-4 lg:left-4 lg:right-auto"
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

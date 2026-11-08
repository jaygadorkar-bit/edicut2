import { useEffect } from "react";
import { useLocation } from "react-router";
import { SITE_ANALYTICS_CONSENT_KEY } from "../../lib/site-analytics";

let pending: { ref: string; campaign: string; landingPath: string } | null = null;
let lastRecorded = "";

/** First-party attribution is opt-in and stores no IP, email, or browser fingerprint. */
export function AffiliateReferralTracker() {
  const location = useLocation();
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const ref = query.get("ref")?.trim().toUpperCase() || "";
    if (/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(ref)) pending = { ref, campaign: (query.get("campaign") || "").slice(0, 48), landingPath: location.pathname };
    let active = true;
    const sync = async () => {
      let accepted = false;
      try { accepted = JSON.parse(localStorage.getItem(SITE_ANALYTICS_CONSENT_KEY) || "null")?.marketing === true; } catch { /* No optional storage without consent. */ }
      const wasAccepted = document.cookie.split(";").some(part => part.trim() === "edicut_marketing_consent=yes");
      document.cookie = `edicut_marketing_consent=${accepted ? "yes" : ""}; Path=/; SameSite=Lax; Max-Age=${accepted ? 15_552_000 : 0}${window.location.protocol === "https:" ? "; Secure" : ""}`;
      if (!accepted) {
        lastRecorded = "";
        if (wasAccepted) void fetch("/api/affiliate-referral", { method: "POST", credentials: "same-origin", body: new URLSearchParams({ intent: "clear" }) }).catch(() => {});
        return;
      }
      if (!pending) return;
      const referral = { ...pending };
      const key = JSON.stringify(referral);
      if (key === lastRecorded) return;
      lastRecorded = key;
      try {
        const response = await fetch("/api/affiliate-referral", { method: "POST", credentials: "same-origin", body: new URLSearchParams(referral) });
        if (!response.ok && active) lastRecorded = "";
      } catch { if (active) lastRecorded = ""; }
    };
    void sync();
    const onConsent = () => { void sync(); };
    window.addEventListener("edicut:consent-change", onConsent);
    return () => { active = false; window.removeEventListener("edicut:consent-change", onConsent); };
  }, [location.pathname, location.search]);
  return null;
}

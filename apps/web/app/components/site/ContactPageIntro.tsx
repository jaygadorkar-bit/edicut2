import { useEffect, useState } from "react";
import { Clapperboard, Mail, MessageCircle, Pause, Play } from "lucide-react";
import { DEFAULT_CONTACT_EMAIL } from "../../lib/contact-email";
import { CONTACT_WHATSAPP_DISPLAY_NUMBER, CONTACT_WHATSAPP_URL } from "../../lib/contact-details";

export function ContactPageIntro({ contactEmail = DEFAULT_CONTACT_EMAIL }: { contactEmail?: string }) {
  const [playback, setPlayback] = useState<"auto" | "playing" | "paused">("auto");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      setPlayback("auto");
    };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  const paused = playback === "paused" || (playback === "auto" && reducedMotion);
  return (
    <div className="contact-intro neo-card">
      <div className="contact-art" data-playback={playback} data-paused={paused}>
        <div className="contact-art-message neo-card" aria-hidden="true"><MessageCircle size={19} /><span>Your vision. Our next cut.</span></div>
        <div className="contact-art-editor neo-surface">
          <div className="contact-art-toolbar" aria-hidden="true"><span /><span /><span /><Clapperboard size={18} /></div>
          <div className="contact-art-preview neo-inset">
            <div className="contact-art-frame" aria-hidden="true" />
            <button type="button" className="contact-art-play neo-icon-badge" aria-label={paused ? "Play preview" : "Pause preview"} onClick={() => setPlayback(paused ? "playing" : "paused")}>
              {paused ? <Play size={25} fill="currentColor" aria-hidden="true" /> : <Pause size={25} aria-hidden="true" />}
            </button>
          </div>
          <div className="contact-art-timeline neo-inset" aria-hidden="true"><span className="contact-art-track"><i /><i /><i /></span><span className="contact-art-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span><span className="contact-art-playhead" /></div>
        </div>
      </div>
      <div className="contact-links">
        <p className="contact-links-heading">A conversation away.</p>
        <a href={`mailto:${contactEmail}`} className="contact-link contact-email">
          <Mail className="contact-link-icon contact-email-icon" size={20} aria-hidden="true" />
          <span><small>Prefer email?</small><strong>{contactEmail}</strong></span>
        </a>
        <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="contact-link contact-whatsapp">
          <MessageCircle className="contact-link-icon contact-whatsapp-icon" size={20} aria-hidden="true" />
          <span><small>Chat with us on WhatsApp</small><strong>{CONTACT_WHATSAPP_DISPLAY_NUMBER}</strong></span>
        </a>
      </div>
    </div>
  );
}

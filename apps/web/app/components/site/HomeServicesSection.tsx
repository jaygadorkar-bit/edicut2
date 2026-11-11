import { ArrowRight, Clapperboard } from "lucide-react";
import { Link } from "react-router";

const shortFormPlatforms = [
  {
    title: "Instagram Reels editing",
    description: "Vertical video editing with readable captions and clear framing for Reels.",
    logo: InstagramMark,
  },
  {
    title: "TikTok video editing",
    description: "Tight pacing, readable captions, and a clear opening for each TikTok.",
    logo: TikTokMark,
  },
  {
    title: "YouTube Shorts editing",
    description: "Vertical Shorts edited from supplied clips or timestamps you choose.",
    logo: YouTubeMark,
  },
];

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" className="home-services__brand-mark" aria-hidden="true" focusable="false">
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="17.6" cy="6.6" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TikTokMark() {
  return (
    <svg viewBox="0 0 20 23" className="home-services__brand-mark" aria-hidden="true" focusable="false">
      <path d="M15.55 3.525C14.6955 2.54953 14.2246 1.29679 14.225 0h-3.8625V15.5c-.0298.8388-.3839 1.6333-.9878 2.2162-.6039.5829-1.4104.9087-2.2497.9088-1.775 0-3.25-1.45-3.25-3.25 0-2.15 2.075-3.7625 4.2125-3.1v-3.95C3.775 7.75 0 11.1 0 15.375 0 19.5375 3.45 22.5 7.1125 22.5c3.925 0 7.1125-3.1875 7.1125-7.125V7.5125c1.5662 1.1248 3.4467 1.7283 5.375 1.725v-3.8625s-2.35.1125-4.05-1.85Z" fill="currentColor" />
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" className="home-services__brand-mark" aria-hidden="true" focusable="false">
      <rect x="2.5" y="5.25" width="19" height="13.5" rx="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M10 9v6l5-3-5-3Z" fill="currentColor" />
    </svg>
  );
}

export function HomeServicesSection() {
  return (
    <section id="editing-services" className="home-services" aria-labelledby="home-services-title" data-analytics-region="services">
      <div className="home-services__layout">
        <div className="home-services__intro">
          <p className="neo-section-label">
            <Clapperboard size={16} aria-hidden="true" />
            Short-form video editing
          </p>
          <h2 id="home-services-title" className="yt-title neo-ink">
            Instagram Reels, TikTok &amp; YouTube Shorts editing
          </h2>
          <p className="home-services__description">
            Need an Instagram Reels editor or TikTok video editor? EdiCut edits vertical clips up to 60 seconds with readable captions, clear framing, and a focused opening. Tell us your platform, preferred length, and the footage or timestamps to use.
          </p>
          <div className="home-services__actions">
            <Link to="/pricing/short-form-video-editing" className="neo-button neo-button--secondary home-services__plans">
              See short-form video editing plans
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <ul className="home-services__platforms" aria-label="Short-form video editing platforms">
          {shortFormPlatforms.map(({ title, description, logo: Logo }) => (
            <li key={title}>
              <article className="neo-card home-services__platform">
                <span className="neo-icon-badge home-services__platform-icon">
                  <Logo />
                </span>
                <div className="home-services__copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

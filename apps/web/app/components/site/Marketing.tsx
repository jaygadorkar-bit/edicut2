import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useMatches } from "react-router";
import { faqs, legalLinks, navLinks, plans as defaultPlans, portfolio, testimonials, workflow } from "./data";
import type { PortfolioSection as PortfolioSectionView, PortfolioVideo } from "../../lib/portfolio.server";

type PricingPlanView = {
  name: string;
  slug: string;
  price: string;
  interval?: string;
  description: string;
  features: string[];
  popular?: boolean;
  badge?: string;
};

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-red-500/20 transition-transform hover:scale-105 active:scale-95">
        <span className="material-symbols-outlined text-[24px]">play_arrow</span>
      </span>
      <span className="text-xl font-black uppercase tracking-tight text-foreground">EdiCut</span>
    </span>
  );
}

export function SiteHeader() {
  const matches = useMatches();
  const rootData = matches.find((m) => m.id === "root")?.data as { promoBarSettings?: { enabled: boolean; message: string } } | undefined;
  const isSignedIn = matches.some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  const promoEnabled = rootData?.promoBarSettings?.enabled;
  const promoMessage = rootData?.promoBarSettings?.message;

  return (
    <>
      {promoEnabled && promoMessage ? (
        <div className="flex h-10 w-full items-center justify-center bg-[#F7F8F9] px-4 text-center text-[11px] font-black uppercase tracking-widest text-foreground">
          {promoMessage}
        </div>
      ) : null}
      
      <header className="glass-nav sticky top-0 z-50 w-full border-b border-black/5 transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/60 p-1.5 backdrop-blur-md md:flex">
            {navLinks.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-5 py-2 text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-foreground text-white shadow-sm shadow-black/10"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to={isSignedIn ? "/dashboard" : "/signin"}
            className="group hidden items-center gap-2 rounded-full bg-primary px-7 py-3 text-[11px] font-black uppercase tracking-wider text-white shadow-xl shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 md:inline-flex"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white transition-colors">
              <span className="material-symbols-outlined text-[12px]">
                {isSignedIn ? "space_dashboard" : "person"}
              </span>
            </span>
            {isSignedIn ? "Go to Dashboard" : "Get Started"}
          </Link>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 border-t border-gray-100 pt-8 text-center md:flex-row md:text-left">
        <Link to="/"><Logo /></Link>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold text-muted-foreground">
          {navLinks.map((item) => <Link key={item.label} to={item.to} className="foreground">{item.label}</Link>)}
          {legalLinks.map((item) => <Link key={item.label} to={item.to} className="foreground">{item.label}</Link>)}
        </div>
        <p className="text-sm font-medium text-muted-foreground">© 2026 EdiCut Studios. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-foreground">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{children}</p>;
}

export function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h2>
      {copy ? <p className="mt-5 text-lg leading-8 text-muted-foreground">{copy}</p> : null}
    </div>
  );
}

export function ButtonLink({ to, children, variant = "primary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary"
    ? "bg-primary text-white [#D90000]"
    : "border border-gray-200 bg-white text-foreground secondary";
  return <Link to={to} className={`inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-sm font-black ${cls}`}>{children}</Link>;
}

export function TrustStrip() {
  return (
    <section className="border-y border-gray-100 bg-white px-5 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-black tracking-[0.22em] text-muted-foreground">
        {["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"].map((logo) => <span key={logo}>{logo}</span>)}
      </div>
    </section>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflow" className="bg-white px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Workflow" title="A simple path from raw footage to final delivery." />

        <div className="mt-14 hidden lg:block">
          <div className="grid grid-cols-5 items-end gap-6">
            {workflow.map(([step, title, , icon]) => (
              <div key={`visual-${step}`} className="flex min-w-0 flex-col items-center text-center">
                <span className="rounded-full bg-muted px-4 py-1.5 text-xs font-black uppercase text-foreground shadow-sm">
                  Step {Number(step)}
                </span>
                <div className={`mt-6 flex items-center justify-center text-primary ${step === "04" ? "h-40" : "h-28"}`}>
                  {step === "04" ? (
                    <div className="relative flex h-36 w-36 items-center justify-center rounded-full border-[3px] border-primary/25">
                      <span className="material-symbols-outlined absolute -top-3 right-7 rotate-[-22deg] bg-white text-primary" style={{ fontSize: 32 }}>navigation</span>
                      <span className="material-symbols-outlined drop-shadow-[14px_14px_0_rgba(0,0,0,0.06)]" style={{ fontSize: 68 }}>fact_check</span>
                      <span className="absolute bottom-2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-foreground shadow-sm">Feedback</span>
                    </div>
                  ) : (
                    <span className="material-symbols-outlined drop-shadow-[18px_18px_0_rgba(0,0,0,0.06)]" style={{ fontSize: 88 }}>
                      {icon}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="relative mx-auto mt-6 grid grid-cols-5 px-8">
            <div className="absolute left-10 right-10 top-1/2 h-5 -translate-y-1/2 rounded-full bg-primary shadow-[0_8px_22px_rgba(255,0,0,0.2)]">
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-around text-white/75">
                {workflow.slice(0, -1).map(([step]) => (
                  <span key={`arrow-${step}`} className="material-symbols-outlined text-[28px]">chevron_right</span>
                ))}
              </div>
            </div>
            {workflow.map(([step]) => (
              <div key={`node-${step}`} className="relative z-10 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-[6px] border-primary bg-white shadow-[0_10px_28px_rgba(255,0,0,0.2)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined text-[24px]">{step === "04" ? "sync" : step === "01" ? "radio_button_unchecked" : "check"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 grid grid-cols-5 gap-6">
            {workflow.map(([step, title, copy]) => (
              <article key={`copy-${step}`} className="min-w-0 text-center">
                <span className="rounded-full bg-muted px-4 py-1.5 text-xs font-black uppercase text-foreground">Step {Number(step)}</span>
                <h3 className="mx-auto mt-5 max-w-[13rem] text-2xl font-black leading-[1.08] tracking-tight text-foreground">{title}</h3>
                <p className="mx-auto mt-4 max-w-[14rem] text-base font-medium leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-4 lg:hidden">
          {workflow.map(([step, title, copy, icon], index) => (
            <article key={`mobile-${step}`} className="relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {index < workflow.length - 1 ? <div className="absolute bottom-[-1rem] left-[2.85rem] top-16 w-1 rounded-full bg-primary/20" /> : null}
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined" style={{ fontSize: 30 }}>{icon}</span>
              </div>
              <div className="min-w-0">
                <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-black uppercase text-foreground">Step {Number(step)}</span>
                <h3 className="mt-3 text-xl font-black leading-tight text-foreground">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortfolioSection({ full = false, sections, className = "" }: { full?: boolean; sections?: PortfolioSectionView[]; className?: string }) {
  const fallbackSections = useMemo<PortfolioSectionView[]>(() => [{
    id: "fallback-featured",
    name: "Featured",
    slug: "featured",
    active: true,
    sortOrder: 1,
    videos: portfolio.slice(0, 5).map((item, index) => ({
      id: `fallback-${item.title}`,
      title: item.title,
      creatorName: item.type,
      tag: item.tag,
      uniqueSellingPoint: item.tag,
      videoUrl: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
      youtubeId: "dQw4w9WgXcQ",
      thumbnailUrl: `https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=800&auto=format&fit=crop`,
      orientation: index % 3 === 0 ? "vertical" : "horizontal",
      sortOrder: index + 1,
    })),
  }], []);
  const portfolioSections = useMemo(() => {
    const source = sections?.length ? sections : fallbackSections;
    return source.filter((section) => section.slug && section.name);
  }, [fallbackSections, sections]);
  const firstTabSlug = portfolioSections[0]?.slug || "featured";
  const [activeTab, setActiveTab] = useState(firstTabSlug);
  const [playingItem, setPlayingItem] = useState<PortfolioVideo | null>(null);
  const activeSection = portfolioSections.find((section) => section.slug === activeTab) || portfolioSections[0];
  const displayPortfolio = useMemo(() => buildPortfolioLayout(activeSection?.videos || []), [activeSection]);

  useEffect(() => {
    if (!portfolioSections.some((section) => section.slug === activeTab)) {
      setActiveTab(firstTabSlug);
    }
  }, [activeTab, firstTabSlug, portfolioSections]);

  useEffect(() => {
    setPlayingItem(null);
  }, [activeTab]);

  useEffect(() => {
    if (!playingItem) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlayingItem(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [playingItem]);

  return (
    <section id="portfolio" className={`bg-secondary px-5 py-20 sm:px-6 ${className}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <Eyebrow>Creator proof</Eyebrow>
          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Edits built to keep viewers watching.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Proof across long-form YouTube stories, Shorts, podcast episodes, fashion edits, and commercial launches sharing one system built for retention.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Portfolio categories">
          {portfolioSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveTab(section.slug)}
              role="tab"
              aria-selected={activeTab === section.slug}
              aria-controls={`portfolio-panel-${section.slug}`}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                activeTab === section.slug
                  ? "border-black bg-black text-white"
                  : "border-gray-200 bg-white text-muted-foreground hover:border-black hover:text-foreground"
              }`}
            >
              {section.name}
            </button>
          ))}
        </div>

        <div id={`portfolio-panel-${activeSection?.slug || "empty"}`} className="mt-10" role="tabpanel">
          <div className="grid gap-2">
            {displayPortfolio.length ? (
              <>
                <div className="grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_330px]">
                  {displayPortfolio[0] ? <PortfolioCard item={displayPortfolio[0]} variant="hero" onPlay={setPlayingItem} /> : null}
                  {displayPortfolio[1] ? (
                    <PortfolioCard
                      item={displayPortfolio[1]}
                      variant={displayPortfolio[1].orientation === "vertical" ? "reel" : "wide"}
                      featured={displayPortfolio[1].orientation === "vertical"}
                      onPlay={setPlayingItem}
                    />
                  ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {displayPortfolio.slice(2, 5).map((item) => (
                    <PortfolioCard key={item.id} item={item} variant="wide" onPlay={setPlayingItem} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {displayPortfolio.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm font-bold text-muted-foreground">
            No portfolio items found for {activeSection?.name || "this tab"}.
          </div>
        ) : null}
      </div>

      {playingItem ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${playingItem.title} video player`}
          onClick={() => setPlayingItem(null)}
        >
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPlayingItem(null)}
              className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:bg-primary hover:text-white"
              aria-label="Close video player"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
            <div className={`overflow-hidden rounded-[28px] bg-black shadow-2xl ${playingItem.orientation === "vertical" ? "mx-auto aspect-[9/16] max-h-[82vh] max-w-[460px]" : "aspect-video"}`}>
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${playingItem.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={`${playingItem.title} video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildPortfolioLayout(videos: PortfolioVideo[]) {
  const orderedVideos = [...videos].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const selectedIds = new Set<string>();
  const take = (video: PortfolioVideo | undefined) => {
    if (!video || selectedIds.has(video.id)) return null;
    selectedIds.add(video.id);
    return video;
  };

  const hero = take(orderedVideos.find((video) => video.orientation === "horizontal") || orderedVideos[0]);
  const reel = take(orderedVideos.find((video) => video.orientation === "vertical") || orderedVideos.find((video) => !selectedIds.has(video.id)));
  const bottomVideos = orderedVideos
    .filter((video) => !selectedIds.has(video.id))
    .sort((a, b) => Number(b.orientation === "horizontal") - Number(a.orientation === "horizontal") || a.sortOrder - b.sortOrder)
    .slice(0, 3);

  bottomVideos.forEach((video) => selectedIds.add(video.id));

  return [hero, reel, ...bottomVideos].filter((video): video is PortfolioVideo => Boolean(video));
}

function PortfolioCard({
  item,
  variant,
  featured = false,
  onPlay,
}: {
  item: PortfolioVideo;
  variant: "hero" | "wide" | "reel";
  featured?: boolean;
  onPlay: (item: PortfolioVideo) => void;
}) {
  const sizeClass = {
    hero: "aspect-[4/3] sm:aspect-video lg:aspect-auto lg:h-[514px]",
    wide: "aspect-video",
    reel: featured ? "aspect-[9/14] lg:h-[514px] lg:aspect-auto" : "aspect-[9/14]",
  }[variant];

  return (
    <button
      type="button"
      onClick={() => onPlay(item)}
      className={`group relative block overflow-hidden rounded-[28px] border border-white bg-black text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)] ${sizeClass}`}
      aria-label={`Play ${item.title} video`}
    >
      <img
        src={item.thumbnailUrl}
        alt={`${item.title} ${item.creatorName} video`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-black">{item.tag}</span>
      </div>

      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-110 group-hover:text-primary">
        <svg
          className="h-16 w-16"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M22 14.5 51 32 22 49.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-white">{item.uniqueSellingPoint}</span>
        </div>
        <p className="text-[11px] font-black uppercase text-white/70">{item.creatorName}</p>
        <h3 className={`${variant === "hero" ? "text-3xl sm:text-4xl" : "text-2xl"} mt-1 font-black text-white`}>{item.title}</h3>
      </div>
    </button>
  );
}

export function DifferentiatorsSection() {
  const items = [
    ["groups", "Creator-aware team", "Editors who understand hooks, pacing, chapters, intros, and retention curves."],
    ["timer", "Reliable turnaround", "A predictable 24-48 hour editing lane keeps your upload calendar moving."],
    ["monitoring", "Retention polish", "Pattern interrupts, captions, audio cleanup, and motion accents where they matter."],
    ["auto_awesome_mosaic", "Repurposing ready", "Turn long-form episodes into Shorts, TikToks, and Reels without starting over."],
  ];
  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Why EdiCut" title="A production partner, not just an editing queue." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map(([icon, title, copy]) => (
            <article key={title} className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="material-symbols-outlined text-primary">{icon}</span>
              <h3 className="mt-5 text-xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingSection({ comparison = false, plans = defaultPlans }: { comparison?: boolean; plans?: PricingPlanView[] }) {
  const [isMonthly, setIsMonthly] = useState(true);

  return (
    <section id="pricing" className="bg-secondary px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Packages" title="Choose the editing lane that matches your upload rhythm." copy="Predictable scope, rapid turnaround, and review-ready deliverables designed for modern creators." />
        <div className="mt-10 flex justify-center">
          <div className="flex cursor-pointer rounded-full border border-gray-200 bg-white p-1 text-sm font-black transition-colors" onClick={() => setIsMonthly(!isMonthly)}>
            <span className={`inline-flex rounded-full px-4 py-2 ${isMonthly ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground"}`}>Monthly</span>
            <span className={`inline-flex rounded-full px-4 py-2 ${!isMonthly ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground"}`}>One-off</span>
          </div>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            let displayPrice = plan.price;
            let displayInterval = plan.interval || "/mo";
            let displayFeatures = plan.features;

            if (!isMonthly) {
              displayInterval = "";
              const numericPrice = parseInt(plan.price.replace(/[^0-9]/g, ""), 10);
              if (!isNaN(numericPrice)) {
                let div = 4;
                if (plan.features[0]?.includes("8")) div = 8;
                if (plan.features[0]?.includes("12")) div = 12;
                const singlePrice = Math.floor(numericPrice / div * 1.2); // Adding 20% premium for one-off
                // Round to nearest 9
                displayPrice = `$${Math.floor(singlePrice / 10) * 10 + 9}`;
              }
              displayFeatures = plan.features.map(f =>
                f.replace("4 videos monthly", "1 video")
                 .replace("8 videos monthly", "1 video")
                 .replace("12+ videos monthly", "1 video")
              );
            }

            return (
              <article key={plan.name} className={`relative rounded-2xl border bg-white p-7 ${plan.popular ? "border-primary shadow-xl shadow-red-500/10" : "border-gray-200"}`}>
                {plan.popular ? <span className="absolute right-5 top-5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase text-white">{plan.badge || "Popular"}</span> : null}
                <h3 className="text-2xl font-black">{plan.name}</h3>
                <p className="mt-3 min-h-14 leading-7 text-muted-foreground">{plan.description}</p>
                <div className="mt-7 text-5xl font-black">{displayPrice}<span className="text-sm text-muted-foreground">{displayInterval}</span></div>
                <ul className="mt-7 space-y-3">
                  {displayFeatures.map((feature) => <li key={feature} className="flex gap-3 text-sm font-bold"><span className="material-symbols-outlined text-[18px] text-primary">check</span>{feature}</li>)}
                </ul>
                <div className="mt-7">
                  <ButtonLink to={`/pricing/${plan.slug}`}>{`View ${plan.name}`}</ButtonLink>
                </div>
              </article>
            );
          })}
        </div>
        {comparison ? <ComparisonTable /> : null}
      </div>
    </section>
  );
}

function ComparisonTable() {
  const rows = [
    ["Turnaround", "48h", "24-36h", "Priority"],
    ["Videos / month", "4", "8", "12+"],
    ["Shorts", "Add-on", "Included", "Unlimited lane"],
    ["Project manager", "Shared", "Shared", "Dedicated"],
    ["Thumbnail support", "Add-on", "Included", "Premium"],
  ];
  return (
    <div className="mt-14 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {rows.map((row) => (
        <div key={row[0]} className="grid grid-cols-4 border-b border-gray-100 last:border-b-0">
          {row.map((cell, index) => <div key={cell} className={`p-4 text-sm ${index === 0 ? "font-black" : "font-bold text-muted-foreground"}`}>{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map(([quote, name, role]) => (
            <article key={name} className="rounded-2xl border border-gray-200 bg-white p-7">
              <p className="text-lg font-bold leading-8">"{quote}"</p>
              <p className="mt-6 font-black">{name}</p>
              <p className="mt-1 text-sm font-bold text-muted-foreground">{role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="bg-secondary px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionIntro eyebrow="FAQ" title="What creators usually ask before starting." />
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-6" open={q === faqs[0][0]}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-black">
                {q}<span className="material-symbols-outlined text-muted-foreground group-open:rotate-180">expand_more</span>
              </summary>
              <p className="mt-4 leading-7 text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection({ compact = false, status }: { compact?: boolean; status?: "sent" }) {
  return (
    <section id="contact" className="px-5 py-20 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.75fr]">
        <div>
          <Eyebrow>Contact us</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Tell us what you are editing next.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">We will review your channel and match you with the most efficient editing lane for your upload rhythm.</p>
        </div>
        <form method="post" action="/contact" className="grid gap-4 rounded-2xl border border-gray-200 bg-secondary p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" name="name" required />
            <Input label="Email" name="email" type="email" required />
          </div>
          {!compact ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Project type" name="projectType" />
              <Input label="Monthly volume" name="monthlyVolume" />
            </div>
          ) : null}
          <label className="grid gap-2 text-sm font-black">
            Message
            <textarea name="brief" required minLength={20} className="min-h-28 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium outline-none focus:border-foreground" />
          </label>
          <button type="submit" className="rounded-2xl bg-primary px-5 py-4 text-sm font-black text-white">Send inquiry</button>
          {status === "sent" ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-black text-primary">Message sent. We will reply shortly.</p> : null}
          <p className="text-sm font-bold text-muted-foreground">hello@edicut.com · Replies within 24 hours</p>
        </form>
      </div>
    </section>
  );
}

function Input({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input name={name} type={type} required={required} className="h-12 rounded-xl border border-gray-200 bg-white px-4 font-medium outline-none focus:border-foreground" />
    </label>
  );
}

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { contactIntakeSchema } from "@edicut/shared/contracts/operations";
import { contactMessages } from "@edicut/db/schema";
import {
  ButtonLink,
  ContactSection,
  DifferentiatorsSection,
  FAQSection,
  PageShell,
  PortfolioSection,
  PricingSection,
  TestimonialsSection,
  TrustStrip,
} from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";

// Clean, Beautiful Modern Classic Lucide SVG Icons in Solid White
function ClapperboardIcon({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.2 6 3 11l-.9-2.4c-.4-1.1.2-2.4 1.3-2.8l12.4-4.5c1.1-.4 2.4.2 2.8 1.3l1.6 3.4Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function VideoCamIcon({ size = 76 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function ScissorsIcon({ size = 70 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </svg>
  );
}

function PlayCircleIcon({ size = 74 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="white" stroke="white" strokeLinejoin="round" />
    </svg>
  );
}

function FilmReelIcon({ size = 74 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 3v18" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </svg>
  );
}

function CameraIcon({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function MicIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function SparklesIcon({ size = 54 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

const topRowAudience = [
  ["sports_esports", "Gaming", "Fast-paced cuts, highlights, reactions, and stream-to-video edits."],
  ["podcasts", "Podcast", "Long-form conversations shaped into polished episodes and clips."],
  ["fitness_center", "Health & fitness", "Clear, energetic edits for workouts, coaching, and wellness content."],
] as const;

const middleRowAudience = [
  ["home_work", "Real estate", "Property tours, market updates, and social-ready listing videos."],
  ["videocam", "Vlogs", "Story-driven pacing that keeps everyday footage engaging."],
  ["sentiment_very_satisfied", "Comedy", "Tighter timing, punchlines, captions, and memorable moments."],
  ["self_improvement", "Lifestyle", "Clean, stylish edits for routines, travel, beauty, and culture."],
] as const;

const bottomRowAudience = [
  ["school", "Educational", "Explainers and lessons that are easy to follow and watch."],
  ["rate_review", "Product reviews", "Clear demos, comparisons, b-roll, and buyer-focused storytelling."],
  ["auto_awesome", "And more", "Tell us what you make and we will match the right editing lane."],
] as const;

export const meta: MetaFunction = () => {
  return [
    { title: "EdiCut — Editing built for YouTubers" },
    { name: "description", content: "Clean editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables." },
  ];
};

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const parsed = contactIntakeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    projectType: formData.get("projectType") || undefined,
    monthlyVolume: formData.get("monthlyVolume") || undefined,
    brief: formData.get("brief"),
  });

  if (!parsed.success) {
    return redirect("/?error=invalid#contact");
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return redirect("/?error=security#contact");
  }

  const db = getDbFromContext(context);
  await db.insert(contactMessages).values({
    name: parsed.data.name,
    email: parsed.data.email,
    projectType: parsed.data.projectType || null,
    monthlyVolume: parsed.data.monthlyVolume || null,
    message: parsed.data.brief,
  });

  return redirect("/?sent=1#contact");
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const [packages, portfolioSections] = await Promise.all([
    getPricingPackages(db, context).then(publicPricingPackages),
    getPortfolioSections(db, context).then(publicPortfolioSections),
  ]);

  return {
    packages,
    portfolioSections,
    sent: url.searchParams.get("sent") === "1",
    error: url.searchParams.get("error"),
  };
}

export default function HomePage() {
  const { packages, portfolioSections, sent, error } = useLoaderData<typeof loader>();
  const [scrollY, setScrollY] = useState(0);
  const contactStatus = sent ? "sent" : error === "security" ? "security-error" : error === "invalid" ? "invalid-error" : undefined;

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <PageShell>
      <div className="neo-home">
        {/* Symmetrical Center-Aligned Hero with Organic Floating Solid White Video Objects */}
        <section className="relative overflow-hidden border-b neo-line px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-32 lg:pt-24">
          {/* Ambient Glows */}
          <div className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#cbdbe8]/50 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 top-10 h-80 w-80 rounded-full bg-[#e2c9ce]/40 blur-3xl" />
          <div className="pointer-events-none absolute left-1/2 -top-24 h-72 w-96 -translate-x-1/2 rounded-full bg-white/60 blur-3xl" />

          {/* Standalone Solid White Neomorphic Floating Icons (Modern Clean Vector Icons) */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            {/* 1. Clapperboard (Top Left) */}
            <div
              className="neo-floating-icon-1 absolute transition-transform duration-150 ease-out hidden sm:block"
              style={{
                top: "12%",
                left: "9%",
                transform: `translate3d(${scrollY * -0.08}px, ${scrollY * 0.24}px, 0) rotate(${-14 + scrollY * 0.04}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <ClapperboardIcon size={74} />
            </div>

            {/* 2. Cinema Video Camera (Mid Left) */}
            <div
              className="neo-floating-icon-2 absolute transition-transform duration-150 ease-out hidden md:block"
              style={{
                top: "45%",
                left: "5%",
                transform: `translate3d(${scrollY * 0.12}px, ${scrollY * -0.32}px, 0) rotate(${8 - scrollY * 0.05}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <VideoCamIcon size={80} />
            </div>

            {/* 3. Editing Scissors (Bottom Left) */}
            <div
              className="neo-floating-icon-3 absolute transition-transform duration-150 ease-out hidden sm:block"
              style={{
                top: "72%",
                left: "13%",
                transform: `translate3d(${scrollY * -0.14}px, ${scrollY * 0.36}px, 0) rotate(${-22 + scrollY * 0.06}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <ScissorsIcon size={70} />
            </div>

            {/* 4. Circle Play Button (Top Right) */}
            <div
              className="neo-floating-icon-2 absolute transition-transform duration-150 ease-out hidden sm:block"
              style={{
                top: "14%",
                right: "10%",
                transform: `translate3d(${scrollY * -0.1}px, ${scrollY * -0.28}px, 0) rotate(${12 + scrollY * 0.05}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <PlayCircleIcon size={76} />
            </div>

            {/* 5. 35mm Film Reel (Mid Right) */}
            <div
              className="neo-floating-icon-1 absolute transition-transform duration-150 ease-out hidden md:block"
              style={{
                top: "47%",
                right: "6%",
                transform: `translate3d(${scrollY * 0.1}px, ${scrollY * 0.32}px, 0) rotate(${-10 - scrollY * 0.04}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <FilmReelIcon size={78} />
            </div>

            {/* 6. DSLR Camera (Bottom Right) */}
            <div
              className="neo-floating-icon-3 absolute transition-transform duration-150 ease-out hidden sm:block"
              style={{
                top: "73%",
                right: "12%",
                transform: `translate3d(${scrollY * 0.12}px, ${scrollY * -0.36}px, 0) rotate(${15 - scrollY * 0.05}deg)`,
                filter: "drop-shadow(6px 10px 18px rgba(132, 148, 163, 0.35)) drop-shadow(-4px -4px 12px rgba(255, 255, 255, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
              }}
            >
              <CameraIcon size={76} />
            </div>

            {/* 7. Studio Microphone (Top Center-Left behind headline) */}
            <div
              className="neo-floating-icon-1 absolute transition-transform duration-150 ease-out hidden lg:block opacity-65"
              style={{
                top: "7%",
                left: "27%",
                transform: `translate3d(${scrollY * 0.08}px, ${scrollY * 0.42}px, 0) rotate(${-8 + scrollY * 0.03}deg)`,
                filter: "drop-shadow(4px 8px 14px rgba(132, 148, 163, 0.3)) drop-shadow(-3px -3px 10px rgba(255, 255, 255, 0.9))",
              }}
            >
              <MicIcon size={58} />
            </div>

            {/* 8. Sparkles (Top Center-Right behind headline) */}
            <div
              className="neo-floating-icon-2 absolute transition-transform duration-150 ease-out hidden lg:block opacity-65"
              style={{
                top: "9%",
                right: "27%",
                transform: `translate3d(${scrollY * -0.08}px, ${scrollY * -0.4}px, 0) rotate(${10 - scrollY * 0.03}deg)`,
                filter: "drop-shadow(4px 8px 14px rgba(132, 148, 163, 0.3)) drop-shadow(-3px -3px 10px rgba(255, 255, 255, 0.9))",
              }}
            >
              <SparklesIcon size={56} />
            </div>
          </div>

          {/* Center Editorial Core (Foreground with higher z-index) */}
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            {/* Section Eyebrow Pill */}
            <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
              YouTube Post-Production Studio
            </div>

            {/* Main Hero Headline */}
            <h1 className="neo-hero-title mt-7 tracking-tight neo-ink">
              <span className="neo-hero-title-line neo-hero-title-line--one">Publish better</span>
              <span className="neo-hero-title-line neo-hero-title-line--two">
                videos{" "}
                <span className="inline-block">without living</span>
              </span>
              <span className="neo-hero-title-line neo-hero-title-line--three">in the timeline.</span>
            </h1>

            {/* Subtitle */}
            <p className="neo-hero-subtitle yt-subtitle mx-auto mt-5 max-w-2xl leading-7 neo-muted sm:mt-6 sm:leading-8">
              A calm, creator-first editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables.
            </p>

            {/* Neomorphic CTA Action Buttons */}
            <div className="neo-hero-actions mt-8 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row sm:gap-3.5">
              <ButtonLink to="/pricing">
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                Choose editing plan
              </ButtonLink>
              <ButtonLink to="/portfolio" variant="secondary">
                <span className="material-symbols-outlined text-[18px]">movie_filter</span>
                View portfolio
              </ButtonLink>
            </div>

            {/* Key Metrics Neomorphic Badges */}
            <div className="mt-10 grid w-full max-w-md grid-cols-3 items-stretch gap-2 sm:mt-12 sm:flex sm:w-auto sm:max-w-none sm:items-center sm:justify-center sm:gap-3">
              {[
                ["48h", "first cuts turnaround"],
                ["500+", "videos published"],
                ["4.9 / 5", "creator satisfaction"],
              ].map(([value, label]) => (
                <div key={label} className="neo-pill min-w-0 rounded-2xl px-2 py-2.5 text-center sm:px-4">
                  <p className="text-lg font-black tracking-tight neo-ink">{value}</p>
                  <p className="text-[10px] font-black uppercase leading-4 tracking-[0.1em] neo-muted sm:leading-normal sm:tracking-[0.12em]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Center-Aligned "Who EdiCut Is For" Section with 3 - 4 - 3 Grid */}
        <section id="creators" className="border-b neo-line px-5 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl text-center">
            {/* Center Header */}
            <div className="mx-auto max-w-2xl">
              <p className="yt-tag neo-section-label">Who EdiCut is for</p>
              <h2 className="yt-title mt-3 neo-ink">Editing support for every kind of creator.</h2>
            </div>

            {/* 3 - 4 - 3 Centered Rows */}
            <div className="mt-12 space-y-4 sm:space-y-5">
              {/* Top Row: 3 items */}
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-5">
                {topRowAudience.map(([icon, title, description]) => (
                  <article key={title} className="neo-card group flex w-full max-w-none flex-col items-center rounded-2xl p-4 text-center sm:max-w-[260px] sm:p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e9cdd1] text-[#a91b27] transition-colors group-hover:bg-primary group-hover:text-white">
                      <span className="material-symbols-outlined text-[22px]">{icon}</span>
                    </span>
                    <h3 className="mt-3.5 text-sm font-black leading-tight neo-ink sm:text-base">{title}</h3>
                    <p className="mt-2 text-xs font-medium leading-5 neo-muted">{description}</p>
                  </article>
                ))}
              </div>

              {/* Middle Row: 4 items */}
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-5">
                {middleRowAudience.map(([icon, title, description]) => (
                  <article key={title} className="neo-card group flex w-full max-w-none flex-col items-center rounded-2xl p-4 text-center sm:max-w-[260px] sm:p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e9cdd1] text-[#a91b27] transition-colors group-hover:bg-primary group-hover:text-white">
                      <span className="material-symbols-outlined text-[22px]">{icon}</span>
                    </span>
                    <h3 className="mt-3.5 text-sm font-black leading-tight neo-ink sm:text-base">{title}</h3>
                    <p className="mt-2 text-xs font-medium leading-5 neo-muted">{description}</p>
                  </article>
                ))}
              </div>

              {/* Bottom Row: 3 items */}
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-5">
                {bottomRowAudience.map(([icon, title, description]) => (
                  <article key={title} className="neo-card group flex w-full max-w-none flex-col items-center rounded-2xl p-4 text-center sm:max-w-[260px] sm:p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e9cdd1] text-[#a91b27] transition-colors group-hover:bg-primary group-hover:text-white">
                      <span className="material-symbols-outlined text-[22px]">{icon}</span>
                    </span>
                    <h3 className="mt-3.5 text-sm font-black leading-tight neo-ink sm:text-base">{title}</h3>
                    <p className="mt-2 text-xs font-medium leading-5 neo-muted">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TrustStrip />
        <PricingSection plans={packages} />
        <PortfolioSection sections={portfolioSections} />
        <DifferentiatorsSection />
        <TestimonialsSection />
        <FAQSection />
        <ContactSection compact status={contactStatus} />
      </div>
    </PageShell>
  );
}

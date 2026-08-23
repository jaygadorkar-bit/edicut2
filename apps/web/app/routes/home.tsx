import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
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
  WorkflowSection,
} from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";

const audienceTypes = [
  ["sports_esports", "Gaming", "Fast-paced cuts, highlights, reactions, and stream-to-video edits."],
  ["podcasts", "Podcast", "Long-form conversations shaped into polished episodes and clips."],
  ["fitness_center", "Health & fitness", "Clear, energetic edits for workouts, coaching, and wellness content."],
  ["home_work", "Real estate", "Property tours, market updates, and social-ready listing videos."],
  ["videocam", "Vlogs", "Story-driven pacing that keeps everyday footage engaging."],
  ["sentiment_very_satisfied", "Comedy", "Tighter timing, punchlines, captions, and memorable moments."],
  ["self_improvement", "Lifestyle", "Clean, stylish edits for routines, travel, beauty, and culture."],
  ["school", "Educational", "Explainers and lessons that are easy to follow and watch."],
  ["rate_review", "Product reviews", "Clear demos, comparisons, b-roll, and buyer-focused storytelling."],
  ["live_tv", "Streaming", "Turn live content into highlights, recaps, and publish-ready episodes."],
  ["auto_awesome", "And more", "Tell us what you make and we will match the right editing lane."],
] as const;

export const meta: MetaFunction = () => {
  return [
    { title: "EdiCut — Editing built for YouTubers" },
    { name: "description", content: "Clean editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables." },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const [packages, portfolioSections] = await Promise.all([
    getPricingPackages(db, context).then(publicPricingPackages),
    getPortfolioSections(db, context).then(publicPortfolioSections),
  ]);

  return { packages, portfolioSections };
}

export default function HomePage() {
  const { packages, portfolioSections } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <section className="bg-white px-5 pb-16 pt-20 text-center sm:px-6 lg:pb-20 lg:pt-24">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 yt-tag tracking-[0.16em]">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Editing service for YouTubers
          </div>
          <h1 className="yt-display mx-auto mt-7 max-w-4xl text-foreground">
            Publish better videos without living in the timeline.
          </h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl">
            A creator-first editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/pricing">Choose editing plan</ButtonLink>
            <ButtonLink to="/portfolio" variant="secondary">View portfolio</ButtonLink>
          </div>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-gray-200 rounded-2xl border border-gray-100 bg-white p-4">
            {["48h first cuts", "500+ videos edited", "4.9 creator rating"].map((stat) => (
              <div key={stat} className="px-3">
                <p className="yt-title">{stat.split(" ")[0]}</p>
                <p className="mt-1 yt-small font-black uppercase tracking-wide">{stat.split(" ").slice(1).join(" ")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-gray-100 bg-[#F7FAFB] px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="yt-tag text-primary">Who EdiCut is for</p>
            <h2 className="yt-title mt-3 text-foreground">Editing support for every kind of creator.</h2>
            <p className="yt-subtitle mt-5">
              From long-form episodes to fast-moving streams, EdiCut helps turn your footage into content your audience wants to finish.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {audienceTypes.map(([icon, title, description]) => (
              <article key={title} className="group rounded-2xl border border-gray-200 bg-white p-4 transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-red-500/5 sm:p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <span className="material-symbols-outlined text-[21px]">{icon}</span>
                </span>
                <h3 className="mt-4 text-sm font-black leading-tight text-foreground sm:text-base">{title}</h3>
                <p className="mt-2 text-xs font-medium leading-5 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <TrustStrip />
      <PricingSection plans={packages} />
      <WorkflowSection />
      <PortfolioSection sections={portfolioSections} />
      <DifferentiatorsSection />
      <TestimonialsSection />
      <FAQSection />
      <ContactSection compact />
    </PageShell>
  );
}

import type { MetaFunction } from "react-router";
import { useState } from "react";
import { ButtonLink, PageShell, TrustStrip } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [
  { title: "FAQ — EdiCut | Frequently Asked Questions" },
  { name: "description", content: "Everything you need to know about EdiCut editing packages, turnaround times, review workflows, and raw footage handoffs." },
];

const categories = ["All", "Workflow", "Pricing", "Footage", "Thumbnails", "Security"];

const allFaqs = [
  {
    category: "Workflow",
    question: "How does the raw footage handoff and editing process work?",
    answer: "Once you subscribe, we set up a dedicated private channel in our creator portal and Slack. You drop your Google Drive, Dropbox, or Frame.io footage links along with any rough notes or timestamps. Our lead editor and project manager begin the assembly within 24 hours and deliver your first cut in 48 hours.",
  },
  {
    category: "Workflow",
    question: "What is your turnaround time for first cuts and revisions?",
    answer: "First cuts are typically delivered within 48 business hours for standard YouTube videos (10-20 minutes). Revisions submitted via timestamped comments are turnaround within 24 hours.",
  },
  {
    category: "Pricing",
    question: "Can I pause or cancel my editing subscription anytime?",
    answer: "Yes! There are no long-term contracts. You can pause or cancel your subscription at any time directly from your billing portal before your next billing cycle.",
  },
  {
    category: "Pricing",
    question: "What happens if my video is longer than the included package limit?",
    answer: "Our packages include up to 60 minutes of finished runtime and up to 600 minutes of raw footage. If you have extra-long podcasts, live stream VODs, or multi-day vlogs, you can easily add raw footage coverage or runtime boosters during checkout or on your dashboard.",
  },
  {
    category: "Footage",
    question: "What video formats and resolutions do you support?",
    answer: "We support 1080p, 4K, ProRes, MP4, MOV, Sony S-Log, Canon C-Log, D-Log, and multi-track audio. All exports are mastered at highest quality with proper bitrate and audio normalization for YouTube.",
  },
  {
    category: "Thumbnails",
    question: "Are custom YouTube thumbnails included in the packages?",
    answer: "Yes! All Creator, Creator Plus, and Creator Pro packages include custom designed YouTube thumbnails with title hook alignment, high-contrast subjects, expressive facial lighting, and optional A/B testing variants.",
  },
  {
    category: "Security",
    question: "How secure is my unreleased footage and intellectual property?",
    answer: "Your footage is 100% confidential. All our editors and managers sign comprehensive NDAs, and all file transfers use encrypted cloud storage. We never share, leak, or publish your footage without your explicit written consent.",
  },
];

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filteredFaqs = allFaqs.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "All" || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <PageShell>
      {/* Hero Header */}
      <section className="relative overflow-hidden border-b neo-line px-5 pb-14 pt-16 sm:px-6 lg:pb-20 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[#e2c9ce]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Knowledge Base & FAQ
          </div>

          <h1 className="yt-display mt-7 neo-ink">
            Frequently asked <span className="text-primary">questions.</span>
          </h1>

          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            Have questions about our editing lanes, turnaround times, software files, or pricing? Find clear answers below.
          </p>

          {/* Recessed Search Bar */}
          <div className="neo-surface mx-auto mt-10 max-w-2xl rounded-2xl p-2 sm:p-2.5">
            <div className="neo-inset relative flex items-center rounded-xl px-4 py-2">
              <span className="material-symbols-outlined text-[22px] text-primary">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics (e.g. turnaround, thumbnails, 4K, pricing)..."
                className="w-full bg-transparent px-3 py-2 text-base font-semibold outline-none neo-ink placeholder:text-gray-400"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-full p-1 text-gray-400 transition hover:text-black"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Categories & Accordions */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {/* Category Filter Pills */}
          <div className="neo-inset mx-auto flex w-fit max-w-full flex-wrap justify-center gap-2 rounded-full p-1.5" role="tablist">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 yt-small font-black transition ${
                  activeCategory === category
                    ? "bg-primary text-white neo-red-glow shadow-md"
                    : "neo-muted hover:bg-white/70 hover:text-foreground"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* FAQ Accordion List */}
          <div className="mt-12 space-y-4">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq, index) => (
                <article key={faq.question} className="neo-card rounded-2xl p-5 sm:p-6">
                  <details className="group [&_summary::-webkit-details-marker]:hidden" open={index === 0}>
                    <summary className="flex cursor-pointer items-center justify-between list-none gap-4">
                      <span className="text-lg font-black neo-ink group-open:text-primary transition-colors">
                        {faq.question}
                      </span>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-gray-600 neo-card group-open:rotate-180 transition-transform">
                        <span className="material-symbols-outlined text-[20px]">expand_more</span>
                      </span>
                    </summary>
                    <div className="mt-4 border-t neo-line pt-4 text-base font-medium leading-relaxed neo-muted">
                      {faq.answer}
                    </div>
                  </details>
                </article>
              ))
            ) : (
              <div className="neo-card rounded-2xl p-12 text-center">
                <span className="material-symbols-outlined text-[36px] text-gray-400">search_off</span>
                <p className="mt-3 text-lg font-bold neo-ink">No answers matching "{searchQuery}"</p>
                <p className="mt-1 text-sm neo-muted">Try a different search keyword or browse by category.</p>
              </div>
            )}
          </div>

          {/* Still Have Questions CTA */}
          <div className="neo-surface mt-14 rounded-[2rem] p-8 text-center sm:p-10">
            <span className="flex mx-auto h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[26px]">support_agent</span>
            </span>
            <h3 className="mt-4 yt-title font-black neo-ink">Still have a specific question?</h3>
            <p className="mx-auto mt-2 max-w-lg yt-subtitle neo-muted">
              Our creator team is ready to answer questions regarding custom workflows, multi-editor squads, or bespoke quotes.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <ButtonLink to="/contact">Chat with us</ButtonLink>
              <ButtonLink to="/pricing" variant="secondary">View Pricing</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <TrustStrip />
    </PageShell>
  );
}

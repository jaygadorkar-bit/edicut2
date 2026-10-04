import type { MetaFunction } from "react-router";
import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { ButtonLink, PageShell, TrustStrip } from "../components/site/Marketing.js";
import { createRouteMeta } from "../lib/seo";

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "YouTube Video Editing FAQs: Pricing, Process, and Delivery | EdiCut",
  "Answers about EdiCut video editing plans, project setup, footage handoff, revisions, turnaround, thumbnails, and account security.",
);

const categories = ["All", "Workflow", "Pricing", "Footage", "Thumbnails", "Security"];

const allFaqs = [
  {
    category: "Workflow",
    question: "How does the raw footage handoff and editing process work?",
    answer: "After EdiCut confirms your project scope and billing, add a Google Drive, Dropbox, OneDrive, or Frame.io sharing link and your notes in the workspace. Set the link permissions for your editor in that storage service. First-cut timing is agreed with the team for each project.",
  },
  {
    category: "Workflow",
    question: "What is your turnaround time for first cuts and revisions?",
    answer: "The first cut is delivered within 48 hours. Included revision rounds are submitted as timestamped notes; revision timing is agreed during the project.",
  },
  {
    category: "Pricing",
    question: "How do I change or cancel a monthly editing plan?",
    answer: "The workspace records project requests and invoices but does not manage recurring charges. Contact EdiCut support to discuss changes or cancellation under your confirmed service agreement before the next billing cycle.",
  },
  {
    category: "Pricing",
    question: "What happens if my video is longer than the included package limit?",
    answer: "Single-video packages list finished-length and raw-footage limits and revision rounds. Monthly packages reserve editing hours. Work outside those allowances is quoted before editing begins. A custom thumbnail or an additional short-form video is available as a $20 add-on with any package.",
  },
  {
    category: "Footage",
    question: "What video formats and resolutions do you support?",
    answer: "We support 1080p, 4K, ProRes, MP4, MOV, Sony S-Log, Canon C-Log, D-Log, and multi-track audio. All exports are mastered at highest quality with proper bitrate and audio normalization for YouTube.",
  },
  {
    category: "Thumbnails",
    question: "Are custom YouTube thumbnails included in the packages?",
    answer: "Custom thumbnails are optional with every package: add one for $20 when choosing your plan. Thumbnails are not included in the base package price. Additional concepts or A/B thumbnail sets can be quoted separately.",
  },
  {
    category: "Security",
    question: "How secure is my unreleased footage and intellectual property?",
    answer: "Your workspace stores the sharing links and project details you submit. Keep source footage in your own storage provider and set its sharing permissions for your editor. Avoid public links for unreleased media; ask support about approved transfer options if you need a different workflow.",
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
            <CircleHelp size={16} aria-hidden="true" />
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
                      <span className="neo-icon-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                        <span className="material-symbols-outlined neo-faq-arrow text-[20px]">expand_more</span>
                      </span>
                    </summary>
                    <div className="neo-faq-answer">
                      <div className="neo-faq-answer__content pt-4 text-base font-medium leading-relaxed neo-muted">
                        {faq.answer}
                      </div>
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
            <span className="neo-icon-badge flex mx-auto h-12 w-12 items-center justify-center rounded-2xl">
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

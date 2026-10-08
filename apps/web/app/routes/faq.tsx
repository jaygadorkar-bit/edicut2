import type { MetaFunction } from "react-router";
import { useState } from "react";
import { CircleHelp, MessageCircle, Search, X } from "lucide-react";
import { ButtonLink, PageShell, TrustStrip } from "../components/site/Marketing.js";
import { FaqSection } from "../components/site/FaqSection";
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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch =
      faq.question.toLowerCase().includes(normalizedQuery) ||
      faq.answer.toLowerCase().includes(normalizedQuery);
    const matchesCategory = activeCategory === "All" || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const resetFilters = () => {
    setSearchQuery("");
    setActiveCategory("All");
  };

  return (
    <PageShell className="faq-page">
      <FaqSection
        id="faq-page"
        headingLevel="h1"
        description="Explore practical answers about the editing process, pricing, footage, delivery, and keeping your work secure."
        items={filteredFaqs}
        className="faq-page__section"
        introContent={(
          <div className="faq-page__controls">
            <div className="faq-page__search">
              <label htmlFor="faq-search">Search questions and answers</label>
              <div className="faq-page__search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  id="faq-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="Try “turnaround” or “4K”"
                />
                {searchQuery ? (
                  <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
                    <X size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="faq-page__categories">
              <p>Browse by topic</p>
              <div className="faq-page__category-list" role="group" aria-label="Filter FAQs by topic">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={activeCategory === category}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
        emptyContent={(
          <div className="faq-page__empty neo-card">
            <span className="neo-icon-badge" aria-hidden="true"><CircleHelp size={22} /></span>
            <h2>No answers found</h2>
            <p>Try another search or clear your filters to browse all topics.</p>
            <button type="button" onClick={resetFilters}>Clear search and filters</button>
          </div>
        )}
      />

      <section className="faq-page__support" aria-labelledby="faq-support-title">
        <div className="faq-page__support-panel neo-surface">
          <div className="faq-page__support-copy">
            <span className="faq-page__support-icon neo-icon-badge" aria-hidden="true">
              <MessageCircle size={21} />
            </span>
            <div>
              <h2 id="faq-support-title">Still have a specific question?</h2>
              <p>Talk with our team about your editing workflow, turnaround, or a custom quote.</p>
            </div>
          </div>
          <div className="faq-page__support-actions">
            <ButtonLink to="/contact">Chat with us</ButtonLink>
            <ButtonLink to="/pricing" variant="secondary">View pricing</ButtonLink>
          </div>
        </div>
      </section>

      <TrustStrip />
    </PageShell>
  );
}

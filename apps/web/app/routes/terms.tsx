import type { MetaFunction } from "react-router";
import { PageShell, TrustStrip } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [
  { title: "Terms and Conditions | EdiCut Creator Post Production" },
  { name: "description", content: "Service scope, monthly plan estimates, project billing, and cancellation terms for EdiCut customers." },
];

const sections = [
  {
    icon: "assignment",
    title: "1. Service Scope & Editing Lanes",
    copy: "EdiCut provides video editing, pacing optimization, sound mixing, color grading, thumbnail packaging, and review workflows according to the monthly plan or custom project scope confirmed with you.",
  },
  {
    icon: "folder_shared",
    title: "2. Creator Responsibilities",
    copy: "Creators are responsible for providing usable raw footage, brand assets, references, clear briefs, and lawful intellectual property rights for all source media provided for editing.",
  },
  {
    icon: "rate_review",
    title: "3. Revisions, Approvals & Turnaround",
    copy: "First cuts are targeted for 48 hours for standard long-form uploads. Each tier includes revision rounds via timestamped feedback. Approval of a final deliverable confirms project stage completion.",
  },
  {
    icon: "credit_card",
    title: "4. Estimates, Billing & Cancellation",
    copy: "Package prices are estimates for monthly editing plans. Submitting a project request does not start a subscription or collect payment. EdiCut confirms scope, price, billing cadence, and service terms with you before work begins. Contact support to change or cancel an active plan under its confirmed agreement.",
  },
  {
    icon: "verified_user",
    title: "5. Acceptable Content & Rights",
    copy: "Customers retain 100% full copyright ownership of all final delivered edits. Customers may not submit unlawful, infringing, hateful, or misleading content for post-production.",
  },
  {
    icon: "support_agent",
    title: "6. Legal & Support Inquiries",
    copy: "Questions regarding these terms or enterprise master service agreements (MSAs) can be directed to legal@edicut.com.",
  },
];

export default function TermsPage() {
  return (
    <PageShell>
      {/* Header */}
      <section className="relative overflow-hidden border-b neo-line px-5 pb-14 pt-16 sm:px-6 lg:pb-20 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[#e2c9ce]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Terms of Service
          </div>

          <h1 className="yt-display mt-7 neo-ink">Terms & Conditions</h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            The service agreement, turnaround expectations, and revision terms for working with EdiCut.
          </p>
          <p className="mt-4 yt-small font-black neo-muted">Effective Date: October 1, 2026</p>
        </div>
      </section>

      {/* Main Legal Content Document */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="neo-surface rounded-[2rem] p-6 sm:p-10 lg:p-12 space-y-8">
            {sections.map((section) => (
              <article key={section.title} className="neo-card rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <span className="neo-icon-badge flex h-9 w-9 items-center justify-center rounded-xl">
                    <span className="material-symbols-outlined text-[20px]">{section.icon}</span>
                  </span>
                  <h2 className="text-xl font-black neo-ink">{section.title}</h2>
                </div>
                <p className="mt-3.5 text-sm font-medium leading-relaxed neo-muted pl-12">
                  {section.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <TrustStrip />
    </PageShell>
  );
}

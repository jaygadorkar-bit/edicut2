import type { MetaFunction } from "react-router";
import { PageShell, TrustStrip } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy | EdiCut Creator Post Production" },
  { name: "description", content: "How EdiCut handles creator raw footage, project data, credentials, and confidential materials." },
];

const sections = [
  {
    icon: "database",
    title: "1. Information We Collect",
    copy: "We collect creator contact details, channel URLs, editing briefs, uploaded footage references, billing records, and project notes necessary to deliver high-quality editing services.",
  },
  {
    icon: "handshake",
    title: "2. How We Use Information",
    copy: "Project information is used exclusively to scope work, assign dedicated lead editors and project managers, process revision cycles, provide customer support, and manage billing.",
  },
  {
    icon: "lock",
    title: "3. Raw Footage & Project Handling",
    copy: "All raw video footage, assets, and project files are handled strictly for editing purposes and accessed only by assigned team members under strict non-disclosure agreements (NDAs).",
  },
  {
    icon: "delete_sweep",
    title: "4. Data Retention & Deletion",
    copy: "Project files and deliverables are safely archived for 90 days after delivery to allow for re-exports and revisions, after which raw files may be permanently purged upon request.",
  },
  {
    icon: "support_agent",
    title: "5. Contact & Privacy Inquiries",
    copy: "For any questions regarding data rights, NDAs, or custom security requirements, contact our data protection team directly at privacy@edicut.com.",
  },
];

export default function PrivacyPage() {
  return (
    <PageShell>
      {/* Header */}
      <section className="relative overflow-hidden border-b neo-line px-5 pb-14 pt-16 sm:px-6 lg:pb-20 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[#e2c9ce]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Legal & Compliance
          </div>

          <h1 className="yt-display mt-7 neo-ink">Privacy Policy</h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            How EdiCut protects creator footage, project assets, and confidential account information.
          </p>
          <p className="mt-4 yt-small font-black neo-muted">Effective Date: May 5, 2026</p>
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

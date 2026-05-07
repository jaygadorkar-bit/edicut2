import type { MetaFunction } from "react-router";
import { PageShell } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [{ title: "Terms and Conditions | EdiCut" }];

const sections = [
  ["Service scope", "EdiCut provides video editing, repurposing, thumbnail support, review workflows, and related creator post-production services according to the selected package."],
  ["Customer responsibilities", "Customers are responsible for providing usable footage, references, brand assets, clear notes, lawful content rights, and timely review feedback."],
  ["Revisions and approvals", "Revision rounds follow the selected package. Approval of a final deliverable confirms that the project stage is complete."],
  ["Payments", "Payment terms, receipts, and manual payment review are handled according to the package agreement and project invoice."],
  ["Acceptable use", "Customers may not submit unlawful, infringing, harmful, or misleading content for editing or distribution."],
  ["Contact", "Questions about these terms can be sent to hello@edicut.com."],
];

export default function TermsPage() {
  return (
    <PageShell>
      <section className="px-5 pb-20 pt-32 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Terms and Conditions</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">The service terms for working with EdiCut.</h1>
          <p className="mt-5 text-sm font-bold text-muted-foreground">Last updated: May 5, 2026</p>
          <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {sections.map(([heading, copy]) => (
              <article key={heading} className="p-6">
                <h2 className="text-xl font-black">{heading}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

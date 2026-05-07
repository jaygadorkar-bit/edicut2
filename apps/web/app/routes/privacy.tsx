import type { MetaFunction } from "react-router";
import { PageShell } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [{ title: "Privacy Policy | EdiCut" }];

const sections = [
  ["Information we collect", "Contact details, project briefs, uploaded references, channel URLs, billing records, and workflow activity needed to deliver editing services."],
  ["How we use information", "We use project information to scope work, assign editors, provide revisions, manage support, process payments, and improve the EdiCut workflow."],
  ["File and project handling", "Video files, reference links, notes, and deliverables are handled for production purposes and shared only with the team members assigned to the project."],
  ["Retention and deletion", "Project data is retained while an account or project relationship is active, unless a customer requests deletion where legally and operationally possible."],
  ["Contact", "Questions about privacy can be sent to hello@edicut.com."],
];

export default function PrivacyPage() {
  return (
    <PageShell>
      <LegalPage eyebrow="Privacy Policy" title="How EdiCut handles creator and project data." sections={sections} />
    </PageShell>
  );
}

function LegalPage({ eyebrow, title, sections: items }: { eyebrow: string; title: string; sections: string[][] }) {
  return (
    <section className="px-5 pb-20 pt-32 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF0000]">{eyebrow}</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight">{title}</h1>
        <p className="mt-5 text-sm font-bold text-[#717171]">Last updated: May 5, 2026</p>
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {items.map(([heading, copy]) => (
            <article key={heading} className="p-6">
              <h2 className="text-xl font-black">{heading}</h2>
              <p className="mt-3 leading-7 text-[#717171]">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

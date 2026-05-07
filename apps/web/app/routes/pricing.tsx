import type { MetaFunction } from "react-router";
import { ContactSection, FAQSection, PageShell, PricingSection, WorkflowSection } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [
  { title: "EdiCut Pricing | Creator editing packages" },
  { name: "description", content: "Transparent video editing packages for YouTube creators." },
];

export default function PricingPage() {
  return (
    <PageShell active="Pricing">
      <section className="bg-white px-5 pb-12 pt-32 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF0000]">Transparent creator packages</p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">
          Choose the editing lane that matches your upload rhythm.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#717171]">
          Predictable scope, rapid turnaround, and review-ready deliverables designed for modern creators.
        </p>
      </section>
      <PricingSection comparison />
      <WorkflowSection />
      <FAQSection />
      <ContactSection compact />
    </PageShell>
  );
}

import type { MetaFunction } from "react-router";
import { ContactSection, FAQSection, PageShell } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [{ title: "Contact EdiCut | Start a project" }];

export default function ContactPage() {
  return (
    <PageShell active="Contact">
      <section className="px-5 pb-6 pt-32 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF0000]">Start a project</p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">Tell us what you are editing next.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#717171]">Our team will review your channel and project details to match you with the right package.</p>
      </section>
      <ContactSection />
      <section className="bg-[#F9F9F9] px-5 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {["Pricing questions", "Portfolio review", "Existing project support"].map((item) => <article key={item} className="rounded-2xl border border-gray-200 bg-white p-6 text-xl font-black">{item}</article>)}
        </div>
      </section>
      <FAQSection />
    </PageShell>
  );
}

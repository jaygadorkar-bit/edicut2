import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { ContactSection, PageShell } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [
  { title: "Medium Editing Package | EdiCut" },
  { name: "description", content: "The Medium EdiCut package for weekly YouTube channels." },
];

export default function PackagePage() {
  const deliverables = ["8 videos monthly", "Motion graphics", "Shorts repurposing", "Audio cleanup", "Captions", "Upload-ready exports"];
  return (
    <PageShell active="Pricing">
      <section className="px-5 pb-16 pt-32 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black uppercase text-[#FF0000]">Most popular</span>
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">Medium Editing Package</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#717171]">
              The perfect editing rhythm for weekly YouTube channels, educators, podcasts, and product reviewers.
            </p>
            <div className="mt-8 flex gap-6 text-sm font-black text-[#717171]"><span>4.9 creator rating</span><span>24-36h turnaround</span><span>2 revision rounds</span></div>
          </div>
          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-black/5 lg:sticky lg:top-24">
            <p className="text-sm font-black uppercase tracking-wide text-[#717171]">Medium plan</p>
            <p className="mt-3 text-5xl font-black">$999<span className="text-sm text-[#717171]">/mo</span></p>
            <ul className="mt-6 space-y-3 text-sm font-bold text-[#282828]">
              {["24-36h delivery", "2 revision rounds", "8 videos monthly", "Shorts and thumbnails"].map((item) => <li key={item}>✓ {item}</li>)}
            </ul>
            <Link to="/contact" className="mt-7 inline-flex w-full justify-center rounded-2xl bg-[#FF0000] px-5 py-4 text-sm font-black text-white">Start package</Link>
            <Link to="/contact" className="mt-3 inline-flex w-full justify-center rounded-2xl border border-gray-200 px-5 py-4 text-sm font-black">Contact us</Link>
          </aside>
        </div>
      </section>
      <section className="bg-[#F9F9F9] px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          {["Long-form edits", "Shorts cutdowns", "Thumbnail support", "Custom motion graphics"].map((item) => <article key={item} className="rounded-2xl border border-gray-200 bg-white p-6 font-black">{item}</article>)}
        </div>
      </section>
      <section className="px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF0000]">Best for</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight">Weekly creators who need reliable polish.</h2>
            <p className="mt-5 leading-8 text-[#717171]">Built for channels with a consistent upload rhythm and a need for retention-focused pacing, clean audio, thumbnails, and repurposed short-form assets.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-2xl font-black">Deliverables</h3>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {deliverables.map((item) => <li key={item} className="rounded-xl bg-[#F9F9F9] p-3 text-sm font-bold">✓ {item}</li>)}
            </ul>
          </div>
        </div>
      </section>
      <ContactSection compact />
    </PageShell>
  );
}

import { Link, NavLink, useMatches } from "react-router";
import { faqs, legalLinks, navLinks, plans, portfolio, testimonials, workflow } from "./data";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF0000] text-white">
        <span className="material-symbols-outlined text-[22px]">play_arrow</span>
      </span>
      <span className="text-xl font-black uppercase tracking-tight">EdiCut</span>
    </span>
  );
}

export function SiteHeader({ active }: { active?: string }) {
  const isSignedIn = useMatches().some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  return (
    <header className="glass-nav fixed left-0 top-0 z-50 w-full border-b border-black/5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link to="/" aria-label="EdiCut home"><Logo /></Link>
        <nav className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/75 p-1 md:flex">
          {navLinks.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={`rounded-full px-4 py-2 text-sm font-bold transition hover:bg-[#F9F9F9] hover:text-[#0F0F0F] ${
                active === item.label ? "bg-[#F9F9F9] text-[#0F0F0F]" : "text-[#717171]"
              }`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to={isSignedIn ? "/dashboard" : "/signin"}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black shadow-lg transition ${
            isSignedIn
              ? "border border-black/5 bg-[#0F0F0F] text-white shadow-black/10 hover:-translate-y-0.5 hover:bg-[#1A1A1A]"
              : "border border-[#FF0000]/10 bg-gradient-to-r from-[#FF0000] to-[#D90000] text-white shadow-red-500/20 hover:-translate-y-0.5 hover:from-[#D90000] hover:to-[#A80000]"
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <span className="material-symbols-outlined text-[20px]">
              {isSignedIn ? "space_dashboard" : "login"}
            </span>
          </span>
          {isSignedIn ? "Dashboard" : "Sign in / Sign up"}
          <span className="material-symbols-outlined text-[18px]">
            {isSignedIn ? "arrow_forward" : "chevron_right"}
          </span>
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 border-t border-gray-100 pt-8 text-center md:flex-row md:text-left">
        <Link to="/"><Logo /></Link>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold text-[#717171]">
          {navLinks.map((item) => <Link key={item.label} to={item.to} className="hover:text-[#0F0F0F]">{item.label}</Link>)}
          {legalLinks.map((item) => <Link key={item.label} to={item.to} className="hover:text-[#0F0F0F]">{item.label}</Link>)}
        </div>
        <p className="text-sm font-medium text-[#717171]">© 2026 EdiCut Studios. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function PageShell({ active, children }: { active?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-[#0F0F0F]">
      <SiteHeader active={active} />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF0000]">{children}</p>;
}

export function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h2>
      {copy ? <p className="mt-5 text-lg leading-8 text-[#717171]">{copy}</p> : null}
    </div>
  );
}

export function ButtonLink({ to, children, variant = "primary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary"
    ? "bg-[#FF0000] text-white hover:bg-[#D90000]"
    : "border border-gray-200 bg-white text-[#0F0F0F] hover:bg-[#F9F9F9]";
  return <Link to={to} className={`inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-sm font-black transition ${cls}`}>{children}</Link>;
}

export function TrustStrip() {
  return (
    <section className="border-y border-gray-100 bg-white px-5 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-black tracking-[0.22em] text-[#717171]">
        {["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"].map((logo) => <span key={logo}>{logo}</span>)}
      </div>
    </section>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflow" className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Workflow" title="A simple path from raw footage to final upload." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {workflow.map(([step, title, copy]) => (
            <article key={step} className="rounded-2xl border border-gray-200 bg-white p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F9F9F9] text-lg font-black text-[#FF0000]">{step}</div>
              <h3 className="mt-6 text-2xl font-black">{title}</h3>
              <p className="mt-3 leading-7 text-[#717171]">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortfolioSection({ full = false }: { full?: boolean }) {
  return (
    <section id="portfolio" className="bg-[#F9F9F9] px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Portfolio" title="Edits built to keep viewers watching." copy="Proof across long-form stories, Shorts, podcasts, music videos, fashion edits, and commercial launches." />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {["All", "Long-form", "Shorts", "Podcasts", "Commercial", "Music"].map((tab, index) => (
            <span key={tab} className={`rounded-full border px-4 py-2 text-sm font-bold ${index === 0 ? "border-[#FF0000] bg-white text-[#FF0000]" : "border-gray-200 bg-white text-[#717171]"}`}>{tab}</span>
          ))}
        </div>
        <div className="mt-12 grid auto-rows-[220px] gap-4 lg:grid-cols-12">
          {portfolio.slice(0, full ? portfolio.length : 4).map((item) => (
            <article key={item.title} className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 ${item.span}`}>
              <div className="absolute inset-x-5 top-5 h-28 rounded-xl border border-gray-200 bg-[linear-gradient(135deg,#ffffff,#f3f3f3)]" />
              <div className="relative flex h-full flex-col justify-end">
                <div className="mb-auto flex justify-between gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#282828] shadow-sm">{item.duration}</span>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#FF0000]">{item.tag}</span>
                </div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#717171]">{item.type}</p>
                <h3 className="mt-2 text-3xl font-black">{item.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DifferentiatorsSection() {
  const items = [
    ["groups", "Creator-aware team", "Editors who understand hooks, pacing, chapters, intros, and retention curves."],
    ["timer", "Reliable turnaround", "A predictable 24-48 hour editing lane keeps your upload calendar moving."],
    ["monitoring", "Retention polish", "Pattern interrupts, captions, audio cleanup, and motion accents where they matter."],
    ["auto_awesome_mosaic", "Repurposing ready", "Turn long-form episodes into Shorts, TikToks, and Reels without starting over."],
  ];
  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Why EdiCut" title="A production partner, not just an editing queue." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map(([icon, title, copy]) => (
            <article key={title} className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="material-symbols-outlined text-[#FF0000]">{icon}</span>
              <h3 className="mt-5 text-xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#717171]">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingSection({ comparison = false }: { comparison?: boolean }) {
  return (
    <section id="pricing" className="bg-[#F9F9F9] px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Packages" title="Choose the editing lane that matches your upload rhythm." copy="Predictable scope, rapid turnaround, and review-ready deliverables designed for modern creators." />
        <div className="mt-10 flex justify-center">
          <div className="rounded-full border border-gray-200 bg-white p-1 text-sm font-black">
            <span className="inline-flex rounded-full bg-[#0F0F0F] px-4 py-2 text-white">Monthly</span>
            <span className="inline-flex px-4 py-2 text-[#717171]">One-off</span>
          </div>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative rounded-2xl border bg-white p-7 ${plan.popular ? "border-[#FF0000] shadow-xl shadow-red-500/10" : "border-gray-200"}`}>
              {plan.popular ? <span className="absolute right-5 top-5 rounded-full bg-[#FF0000] px-3 py-1 text-xs font-black uppercase text-white">Popular</span> : null}
              <h3 className="text-2xl font-black">{plan.name}</h3>
              <p className="mt-3 min-h-14 leading-7 text-[#717171]">{plan.description}</p>
              <div className="mt-7 text-5xl font-black">{plan.price}<span className="text-sm text-[#717171]">/mo</span></div>
              <ul className="mt-7 space-y-3">
                {plan.features.map((feature) => <li key={feature} className="flex gap-3 text-sm font-bold"><span className="material-symbols-outlined text-[18px] text-[#FF0000]">check</span>{feature}</li>)}
              </ul>
              <ButtonLink to={`/pricing/${plan.slug}`}>{`View ${plan.name}`}</ButtonLink>
            </article>
          ))}
        </div>
        {comparison ? <ComparisonTable /> : null}
      </div>
    </section>
  );
}

function ComparisonTable() {
  const rows = [
    ["Turnaround", "48h", "24-36h", "Priority"],
    ["Videos / month", "4", "8", "12+"],
    ["Shorts", "Add-on", "Included", "Unlimited lane"],
    ["Project manager", "Shared", "Shared", "Dedicated"],
    ["Thumbnail support", "Add-on", "Included", "Premium"],
  ];
  return (
    <div className="mt-14 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {rows.map((row) => (
        <div key={row[0]} className="grid grid-cols-4 border-b border-gray-100 last:border-b-0">
          {row.map((cell, index) => <div key={cell} className={`p-4 text-sm ${index === 0 ? "font-black" : "font-bold text-[#717171]"}`}>{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map(([quote, name, role]) => (
            <article key={name} className="rounded-2xl border border-gray-200 bg-white p-7">
              <p className="text-lg font-bold leading-8">"{quote}"</p>
              <p className="mt-6 font-black">{name}</p>
              <p className="mt-1 text-sm font-bold text-[#717171]">{role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="bg-[#F9F9F9] px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionIntro eyebrow="FAQ" title="What creators usually ask before starting." />
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-6" open={q === faqs[0][0]}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-black">
                {q}<span className="material-symbols-outlined text-[#717171] group-open:rotate-180">expand_more</span>
              </summary>
              <p className="mt-4 leading-7 text-[#717171]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="contact" className="px-5 py-20 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.75fr]">
        <div>
          <Eyebrow>Contact us</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Tell us what you are editing next.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#717171]">We will review your channel and match you with the most efficient editing lane for your upload rhythm.</p>
        </div>
        <form className="grid gap-4 rounded-2xl border border-gray-200 bg-[#F9F9F9] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" />
            <Input label="Email" />
          </div>
          <Input label="Channel URL" />
          {!compact ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Project type" />
              <Input label="Monthly volume" />
            </div>
          ) : null}
          <Input label="Budget/package interest" />
          <label className="grid gap-2 text-sm font-black">
            Message
            <textarea className="min-h-28 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium outline-none focus:border-[#0F0F0F]" />
          </label>
          <button type="button" className="rounded-2xl bg-[#FF0000] px-5 py-4 text-sm font-black text-white">Send inquiry</button>
          <p className="text-sm font-bold text-[#717171]">hello@edicut.com · Replies within 24 hours</p>
        </form>
      </div>
    </section>
  );
}

function Input({ label }: { label: string }) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input className="h-12 rounded-xl border border-gray-200 bg-white px-4 font-medium outline-none focus:border-[#0F0F0F]" />
    </label>
  );
}

export const runtime = "edge";

import Image from "next/image";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Film,
  FolderInput,
  Layers3,
  MessageSquareQuote,
  PlayCircle,
  ShieldCheck,
  Star,
  Upload,
} from "lucide-react";

const trustStats = [
  { label: "Projects Delivered", value: "2,400+" },
  { label: "Average First Draft", value: "48 Hours" },
  { label: "Client Retention", value: "91%" },
  { label: "Editor Rating", value: "4.9/5" },
];

const trustLogos = [
  "AURA MEDIA",
  "NORTHFRAME",
  "CREATORLAB",
  "MONOCAST",
  "PIXEL POST",
  "STUDIO 28",
];

const workflowStats = [
  { label: "First-draft approval", value: "90%" },
  { label: "Revision response", value: "< 12 Hours" },
  { label: "Delivery rhythm", value: "Weekly-ready" },
];

const workflowSteps = [
  {
    step: "01",
    title: "Choose Package",
    description:
      "Select Basic, Medium, or Pro based on your footage volume and turnaround needs.",
    icon: FolderInput,
  },
  {
    step: "02",
    title: "Upload",
    description:
      "Share raw footage, references, and brand assets through a structured intake flow.",
    icon: Upload,
  },
  {
    step: "03",
    title: "Review",
    description:
      "Approve cuts with timestamped feedback and receive polished exports ready to publish.",
    icon: MessageSquareQuote,
  },
];

const differentiators = [
  {
    title: "Dedicated Team",
    description:
      "A lead editor and reviewer keep your visual style consistent across every release.",
    icon: BadgeCheck,
  },
  {
    title: "Turnaround Speed",
    description:
      "Predictable delivery windows built for creators with weekly publishing schedules.",
    icon: Clock3,
  },
  {
    title: "Retention-Focused Editing",
    description:
      "Hook pacing, cuts, captions, and emphasis points are shaped around watch-time goals.",
    icon: Film,
  },
  {
    title: "Repurposing Support",
    description:
      "Turn one production day into a flagship episode, shorts, and promo clips.",
    icon: Layers3,
  },
];

const caseStudies = [
  {
    type: "Case Study",
    title: "Aura Media",
    result: "+45% Audience Retention",
    description:
      "Rebuilt episode pacing and hook structure for long-form business storytelling.",
  },
  {
    type: "Case Study",
    title: "MonoCast",
    result: "12 Short Clips Per Recording",
    description:
      "Podcast workflow converted into weekly long-form and short-form distribution.",
  },
  {
    type: "Case Study",
    title: "Northframe",
    result: "2x Publishing Consistency",
    description:
      "Introduced a repeatable approval loop for creator-led product breakdowns.",
  },
];

const resultStats = [
  { value: "+45%", label: "Avg. Retention Lift" },
  { value: "12", label: "Clips Per Shoot" },
  { value: "2x", label: "Publishing Consistency" },
];

const testimonials = [
  {
    quote:
      "The quality jump was immediate. Revisions got cleaner and our episodes started landing on schedule again.",
    name: "Ariana Cole",
    role: "YouTube Educator",
  },
  {
    quote:
      "Our team stopped juggling random freelancers. It finally feels like one coherent post-production pipeline.",
    name: "Marcus Vale",
    role: "Podcast Host",
  },
  {
    quote:
      "We hand off footage and get focused edits back fast. The retention improvements were obvious in weeks.",
    name: "Nina Hart",
    role: "Brand Channel Lead",
  },
];

const pricingTiers = [
  {
    name: "Basic",
    price: "$49",
    description: "Fast, clean editing for straightforward YouTube videos.",
    features: [
      "Up to 10GB Footage",
      "72 Hour Turnaround",
      "Basic Cleanup & Color",
      "1 Revision",
    ],
    popular: false,
  },
  {
    name: "Medium",
    price: "$149",
    description: "Best for active channels optimizing pacing and viewer retention.",
    features: [
      "Up to 50GB Footage",
      "48 Hour Turnaround",
      "Advanced Pacing & Color",
      "Graphics & Captions",
      "3 Revisions",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "$499",
    description: "High-touch editing for flagship long-form and launch content.",
    features: [
      "Up to 100GB Footage",
      "24 Hour Turnaround",
      "Full YouTube Packaging",
      "Sound Design & Motion",
      "Unlimited Revisions",
    ],
    popular: false,
  },
];

const faqs = [
  {
    q: "How does onboarding work?",
    a: "Choose a package, complete the intake form, and share your footage plus references. We align on pace, style, and deliverables before the first cut.",
  },
  {
    q: "Do you support short-form and long-form editing?",
    a: "Yes. We handle flagship long-form videos and can generate short-form variations from the same source material.",
  },
  {
    q: "How do revisions get handled?",
    a: "Feedback is submitted with timestamps so editors can apply precise updates quickly without long message threads.",
  },
  {
    q: "Can we use a custom workflow?",
    a: "Yes. Teams can add tailored review checkpoints, graphics intensity, and delivery cadence based on production needs.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <Image
              src="https://res.cloudinary.com/doseyuwfa/image/upload/v1777278136/edicut/hero/hero_background.webp"
              alt="Premium skin care production"
              fill
              priority
              sizes="100vw"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/55 to-background" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/35 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white/80 backdrop-blur-md">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Trusted by creators and brands
            </div>
            <h1 className="mt-8 text-5xl font-black tracking-tight text-white sm:text-7xl lg:text-8xl">
              Cinematic Editing
              <br />
              <span className="bg-gradient-to-r from-primary to-cyan-200 bg-clip-text text-transparent">
                Built to Keep Viewers Watching
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-lg text-muted-foreground sm:text-xl">
              Premium post-production for YouTube creators and brands that need
              stronger retention, cleaner approvals, and dependable weekly output.
            </p>

            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="h-14 rounded-xl bg-gradient-to-r from-cyan-300 to-primary px-8 text-base font-bold text-primary-foreground shadow-[0_0_50px_-15px_rgba(34,211,238,0.7)] hover:opacity-95"
                asChild
              >
                <Link href="/pricing">
                  Book Your Editor <ChevronRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-14 rounded-xl border-white/15 bg-black/25 px-8 text-base font-bold text-white backdrop-blur-md hover:bg-white/10"
                asChild
              >
                <Link href="/portfolio">Watch Sample Cuts</Link>
              </Button>
            </div>

            <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trustStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl bg-black/35 px-6 py-5 text-left backdrop-blur-md"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/55">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-3xl font-black text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#111111] py-10">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-6 text-center text-xs font-bold uppercase tracking-[0.28em] text-white/50">
              Trusted by high-output teams and ambitious creators
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {trustLogos.map((logo) => (
                <div
                  key={logo}
                  className="rounded-xl bg-white/[0.04] px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-white/60"
                >
                  {logo}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.3em] text-primary">
                Workflow
              </span>
              <h2 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
                Choose Package, Upload, Review
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                A streamlined 3-step process that makes delivery and approvals predictable.
              </p>
            </div>

            <div className="mb-10 grid gap-4 md:grid-cols-3">
              {workflowStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl bg-card/60 px-6 py-5 backdrop-blur-sm"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {workflowSteps.map((item) => (
                <div
                  key={item.step}
                  className="rounded-[1.75rem] bg-card/70 p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="rounded-2xl bg-primary/15 p-4 text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                      Step {item.step}
                    </span>
                  </div>
                  <h3 className="mt-8 text-2xl font-bold text-white">{item.title}</h3>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0e1116] py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.3em] text-primary">
                Differentiators
              </span>
              <h2 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
                Built for reliable output, not one-off edits
              </h2>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {differentiators.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.75rem] bg-card/50 p-8 transition-colors hover:bg-card/80"
                >
                  <div className="inline-flex rounded-2xl bg-primary/10 p-4 text-primary">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-white">{item.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0a] py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-14 flex items-end justify-between">
              <div>
                <h2 className="text-4xl font-bold tracking-tight text-white">
                  Portfolio Showcase
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Bento-style layouts with results-driven proof cards.
                </p>
              </div>
              <Button
                variant="ghost"
                className="hidden rounded-xl font-bold text-primary hover:bg-primary hover:text-primary-foreground md:flex"
                asChild
              >
                <Link href="/portfolio">
                  View Portfolio <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid auto-rows-[280px] grid-cols-1 gap-6 md:grid-cols-3">
              <div className="group relative col-span-1 row-span-2 overflow-hidden rounded-3xl bg-card md:col-span-2">
                <Image
                  src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80"
                  alt="Documentary editing timeline"
                  fill
                  sizes="(min-width: 768px) 66vw, 100vw"
                  className="h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <PlayCircle className="h-20 w-20 text-white drop-shadow-2xl" />
                </div>
                <div className="absolute bottom-0 left-0 p-10">
                  <span className="mb-2 block text-sm font-bold uppercase tracking-widest text-primary">
                    Long-Form
                  </span>
                  <h3 className="text-4xl font-extrabold text-white">
                    Channel Documentary Cut
                  </h3>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-3xl bg-card">
                <Image
                  src="https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&q=80"
                  alt="Talking head edit"
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-primary">
                    Commentary
                  </span>
                  <h3 className="text-2xl font-bold text-white">Retention-Focused Cuts</h3>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-3xl bg-card">
                <Image
                  src="https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?auto=format&fit=crop&q=80"
                  alt="Product breakdown episode"
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-primary">
                    Product
                  </span>
                  <h3 className="text-2xl font-bold text-white">Feature Breakdown Episode</h3>
                </div>
              </div>
            </div>

            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              {caseStudies.map((item) => (
                <div key={item.title} className="rounded-[1.75rem] bg-card/60 p-8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
                      {item.type}
                    </span>
                    <PlayCircle className="h-5 w-5 text-white/45" />
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary/90">
                    {item.result}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#081018] py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.3em] text-primary">
                  Testimonials & Results
                </span>
                <h2 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
                  Proof from teams shipping every week
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {resultStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl bg-black/20 px-5 py-4 text-center"
                  >
                    <p className="text-3xl font-black text-white">{stat.value}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-white/55">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {testimonials.map((item) => (
                <div key={item.name} className="rounded-[1.75rem] bg-black/20 p-8 backdrop-blur-sm">
                  <div className="flex items-center gap-1 text-primary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-6 text-lg leading-8 text-white/90">&ldquo;{item.quote}&rdquo;</p>
                  <div className="mt-8 pt-5">
                    <p className="text-base font-bold text-white">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="text-4xl font-bold tracking-tight text-white">Pricing</h2>
              <p className="mt-4 text-muted-foreground">
                Three tiers that map to your content volume and production tempo.
              </p>
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-3">
              {pricingTiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`relative flex flex-col rounded-[2rem] p-10 ${
                    tier.popular
                      ? "bg-card/80 shadow-2xl shadow-primary/5 lg:-translate-y-3"
                      : "bg-card/45"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
                  <div className="mt-6 text-6xl font-black text-white">{tier.price}</div>
                  <p className="mt-6 text-sm font-medium text-muted-foreground">
                    {tier.description}
                  </p>

                  <ul className="mt-10 flex-1 space-y-5">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center text-sm font-medium text-muted-foreground"
                      >
                        <CheckCircle2 className="mr-3 h-5 w-5 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`mt-12 h-14 w-full rounded-xl text-base font-bold ${
                      tier.popular
                        ? "shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)]"
                        : "bg-muted text-white hover:bg-muted/80"
                    }`}
                    variant={tier.popular ? "default" : "secondary"}
                    asChild
                  >
                    <Link
                      href={`/pricing/${tier.name.toLowerCase() as "basic" | "medium" | "pro"}`}
                    >
                      Buy {tier.name}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#05080d] py-28">
          <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.3em] text-primary">
                FAQ
              </span>
              <h2 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
                Common questions before kickoff
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Answers around onboarding, revisions, content types, and custom workflows.
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q} className="rounded-[1.5rem] bg-card/55 p-6">
                  <h3 className="text-lg font-bold text-white">{faq.q}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background py-24">
          <div className="mx-auto max-w-5xl px-6">
            <div className="overflow-hidden rounded-[2.2rem] bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),rgba(8,12,18,0.92)_58%)] px-8 py-14 text-center shadow-[0_0_80px_-30px_rgba(34,211,238,0.35)] sm:px-12">
              <h2 className="mt-2 text-4xl font-black tracking-tight text-white md:text-6xl">
                Ready to ship your next release?
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
                Move from raw footage to publish-ready edits with a team built for
                consistent weekly momentum.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" className="h-14 rounded-xl px-8 text-base font-bold" asChild>
                  <Link href="/pricing">
                    See Pricing <ChevronRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 rounded-xl border-white/15 bg-transparent px-8 text-base font-bold text-white hover:bg-white/5"
                  asChild
                >
                  <Link href="/contact">Book a Call</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

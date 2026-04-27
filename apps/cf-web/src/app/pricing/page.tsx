export const runtime = "edge";

import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";

import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronRight, Star } from "lucide-react";
import { publicPackages } from "@/lib/public-packages";

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-background pb-20 pt-32">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
              Product Catalog
            </div>
            <h1 className="mt-8 text-5xl font-black tracking-tight text-white sm:text-7xl">
              Choose a Package, Then <br />
              Open the Full Product Page
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-lg font-medium text-muted-foreground">
              Each editing tier now has a dedicated detail page with package
              scope, deliverables, ideal use cases, FAQs, and a clear purchase
              path, closer to a marketplace product flow.
            </p>
          </div>
        </section>

        <section className="bg-background pb-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid items-stretch gap-8 lg:grid-cols-3">
              {publicPackages.map((tier) => (
                <div
                  key={tier.slug}
                  className={`relative flex flex-col rounded-[2rem] border p-10 ${
                    tier.popular
                      ? "border-primary bg-card/80 shadow-2xl shadow-primary/5 lg:-translate-y-4"
                      : "border-border/50 bg-card/40"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                      Most Popular
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
                        {tier.badge}
                      </p>
                      <h3 className="mt-3 text-3xl font-black text-white">
                        {tier.name}
                      </h3>
                    </div>
                    <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                      {tier.delivery}
                    </div>
                  </div>

                  <div className="mt-8 flex items-end gap-2">
                    <span className="text-6xl font-black text-white">
                      {tier.price}
                    </span>
                    <span className="pb-3 text-sm font-medium text-muted-foreground">
                      per video
                    </span>
                  </div>

                  <p className="mt-6 text-sm font-medium leading-7 text-muted-foreground">
                    {tier.shortDescription}
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                        Delivery
                      </p>
                      <p className="mt-2 text-sm font-bold text-white">
                        {tier.delivery}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                        Footage
                      </p>
                      <p className="mt-2 text-sm font-bold text-white">
                        {tier.footage}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                        Revisions
                      </p>
                      <p className="mt-2 text-sm font-bold text-white">
                        {tier.revisions}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-10 flex-1 space-y-4">
                    {tier.features.slice(0, 5).map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center text-sm font-medium text-muted-foreground"
                      >
                        <CheckCircle2 className="mr-3 h-5 w-5 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-10 flex flex-col gap-3">
                    <Button
                      className={`h-14 rounded-xl text-base font-bold ${
                        tier.popular
                          ? "shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)]"
                          : ""
                      }`}
                      variant={tier.popular ? "default" : "secondary"}
                      asChild
                    >
                      <Link href={`/pricing/${tier.slug}`}>
                        Buy {tier.name} <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 rounded-xl border-border/40 bg-transparent font-bold text-white hover:bg-white/5"
                      asChild
                    >
                      <Link href={`/pricing/${tier.slug}`}>View Product Page</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/20 bg-[#0A0A0A] py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-16 lg:grid-cols-[1fr_1.05fr]">
              <div>
                <h2 className="text-4xl font-bold tracking-tight text-white">
                  Need something highly bespoke?
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                  For larger campaigns, custom pipelines, or more hands-on review
                  workflows, there is still a direct studio route outside the
                  packaged offers.
                </p>
                <div className="mt-10 rounded-[2rem] border border-border/40 bg-card/50 p-8">
                  <div className="flex items-center gap-2 text-primary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-6 text-lg leading-8 text-white/90">
                    Dummy content: this block acts like a premium custom offer,
                    giving buyers an option when the standard catalog is not a
                    fit.
                  </p>
                  <Button className="mt-8 h-12 rounded-xl font-bold" asChild>
                    <Link href="/contact">Contact Studio</Link>
                  </Button>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white">
                  Shopping Questions
                </h2>
                <div className="mt-8 space-y-4">
                  {[
                    {
                      q: "What happens after clicking buy?",
                      a: "The package product page opens first, where buyers can inspect scope, deliverables, FAQs, and the purchase CTA before continuing.",
                    },
                    {
                      q: "Can buyers compare packages without losing context?",
                      a: "Yes. Each detail page links to neighboring packages so the flow behaves more like a marketplace listing than a plain pricing table.",
                    },
                    {
                      q: "Is this ready for real content later?",
                      a: "Yes. The structure is set up so placeholder copy can be replaced with real package details without changing the route design.",
                    },
                  ].map((faq) => (
                    <div
                      key={faq.q}
                      className="rounded-2xl border border-border/30 bg-card/50 p-6"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white">{faq.q}</h3>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm leading-7 text-muted-foreground">
                        {faq.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

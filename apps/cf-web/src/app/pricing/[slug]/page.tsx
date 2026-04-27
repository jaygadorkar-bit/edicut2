export const runtime = "edge";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileVideo,
  FolderKanban,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  Star,
} from "lucide-react";
import { getPublicPackage, publicPackages } from "@/lib/public-packages";

export default async function PackageProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getPublicPackage(slug);

  if (!product) {
    notFound();
  }

  const relatedPackages = publicPackages.filter((item) => item.slug !== product.slug);

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        <section className="border-b border-border/20 bg-background/95 pt-28">
          <div className="mx-auto max-w-7xl px-6 pb-10">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Pricing
            </Link>

            <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
                    {product.badge}
                  </span>
                  {product.popular && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white/75">
                      Most Popular
                    </span>
                  )}
                </div>

                <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl">
                  I will deliver the {product.name.toLowerCase()} Edicut
                  package for YouTube creators
                </h1>

                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
                  <div className="inline-flex items-center gap-2">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    4.9
                    <span>(dummy 37 reviews)</span>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    Levelled editing workflow
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Secure handoff process
                  </div>
                </div>

                <p className="mt-8 max-w-3xl text-lg leading-8 text-muted-foreground">
                  {product.heroDescription}
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {product.highlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-border/30 bg-card/50 px-5 py-4"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-2 text-xl font-black text-white">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="lg:sticky lg:top-28 lg:self-start">
                <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-card/80 shadow-[0_0_80px_-35px_rgba(34,211,238,0.45)]">
                  <div className="border-b border-border/20 p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
                          Buy This Package
                        </p>
                        <h2 className="mt-3 text-3xl font-black text-white">
                          {product.name}
                        </h2>
                      </div>
                      <div className="text-right">
                        <p className="text-5xl font-black text-white">
                          {product.price}
                        </p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
                          per video
                        </p>
                      </div>
                    </div>

                    <p className="mt-6 text-sm leading-7 text-muted-foreground">
                      {product.shortDescription}
                    </p>

                    <div className="mt-8 grid gap-3">
                      <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock3 className="h-4 w-4 text-primary" />
                          Delivery
                        </span>
                        <span className="text-sm font-bold text-white">
                          {product.delivery}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <RefreshCcw className="h-4 w-4 text-primary" />
                          Revisions
                        </span>
                        <span className="text-sm font-bold text-white">
                          {product.revisions}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/60 px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <FileVideo className="h-4 w-4 text-primary" />
                          Footage
                        </span>
                        <span className="text-sm font-bold text-white">
                          {product.footage}
                        </span>
                      </div>
                    </div>

                    <Button className="mt-8 h-14 w-full rounded-xl text-base font-bold" asChild>
                      <Link href={`/login?package=${product.slug}`}>
                        Continue to Buy <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="mt-3 h-12 w-full rounded-xl border-white/10 bg-transparent font-bold text-white hover:bg-white/5"
                      asChild
                    >
                      <Link href="/contact">Ask a Question</Link>
                    </Button>
                  </div>

                  <div className="p-8">
                    <h3 className="text-sm font-bold uppercase tracking-[0.28em] text-white/70">
                      This package includes
                    </h3>
                    <ul className="mt-5 space-y-4">
                      {product.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center text-sm font-medium text-muted-foreground"
                        >
                          <CheckCircle2 className="mr-3 h-5 w-5 text-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="bg-background py-14">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-16 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-16">
                <div>
                  <h2 className="text-3xl font-black text-white">Product Gallery</h2>
                  <div className="mt-8 grid gap-5 md:grid-cols-2">
                    {product.gallery.map((item, index) => (
                      <div
                        key={item.title}
                        className={`overflow-hidden rounded-[2rem] border border-border/30 bg-card/50 ${
                          index === 0 ? "md:col-span-2" : ""
                        }`}
                      >
                        <div className="relative h-[260px]">
                          <Image
                            src={item.image}
                            alt={item.title}
                            fill
                            sizes="(min-width: 768px) 50vw, 100vw"
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <PlayCircle className="h-16 w-16 text-white/85 drop-shadow-2xl" />
                          </div>
                          <div className="absolute bottom-0 left-0 p-8">
                            <h3 className="text-2xl font-black text-white">
                              {item.title}
                            </h3>
                            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">
                              {item.caption}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black text-white">About This Product</h2>
                  <div className="mt-8 rounded-[2rem] border border-border/30 bg-card/50 p-8">
                    <p className="text-base leading-8 text-muted-foreground">
                      {product.heroDescription}
                    </p>
                    <p className="mt-6 text-base leading-8 text-muted-foreground">
                      Dummy content: this page is structured like a marketplace
                      product listing, so buyers can inspect scope before moving
                      into the purchase flow. That makes the package feel like a
                      product, not just a line item in a pricing grid.
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black text-white">Best For</h2>
                  <div className="mt-8 grid gap-4">
                    {product.idealFor.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-border/30 bg-card/50 px-6 py-5"
                      >
                        <p className="flex items-center text-sm font-medium text-muted-foreground">
                          <CheckCircle2 className="mr-3 h-5 w-5 text-primary" />
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black text-white">What You Get</h2>
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {product.includes.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-border/30 bg-card/50 p-6"
                      >
                        <p className="text-sm font-medium leading-7 text-muted-foreground">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black text-white">FAQ</h2>
                  <div className="mt-8 space-y-4">
                    {product.faqs.map((faq) => (
                      <div
                        key={faq.q}
                        className="rounded-2xl border border-border/30 bg-card/50 p-6"
                      >
                        <h3 className="text-lg font-bold text-white">{faq.q}</h3>
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">
                          {faq.a}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="rounded-[2rem] border border-border/30 bg-card/50 p-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <FolderKanban className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
                        Seller Snapshot
                      </p>
                      <h3 className="mt-1 text-2xl font-black text-white">
                        Edicut Studio
                      </h3>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-7 text-muted-foreground">
                    Dummy content: positioned like a marketplace seller card,
                    showing a clear operator identity and service confidence
                    instead of an anonymous package.
                  </p>
                  <div className="mt-8 grid gap-3">
                    {[
                      "Fast response time",
                      "Structured revision workflow",
                      "YouTube-focused editing system",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-center rounded-2xl border border-border/30 bg-background/60 px-4 py-3 text-sm font-medium text-muted-foreground"
                      >
                        <CheckCircle2 className="mr-3 h-5 w-5 text-primary" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-border/30 bg-card/50 p-8">
                  <h3 className="text-2xl font-black text-white">
                    Compare Other Packages
                  </h3>
                  <div className="mt-6 space-y-4">
                    {relatedPackages.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/pricing/${item.slug}`}
                        className="block rounded-2xl border border-border/30 bg-background/50 p-5 transition-colors hover:border-primary/30 hover:bg-background"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
                              {item.badge}
                            </p>
                            <h4 className="mt-2 text-lg font-black text-white">
                              {item.name}
                            </h4>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                              {item.shortDescription}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-white">
                              {item.price}
                            </p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
                              {item.delivery}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
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

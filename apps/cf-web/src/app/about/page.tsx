export const runtime = "edge";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        {/* ─── Hero Section ───────────────────────────────── */}
        <section className="relative pt-32 pb-24 overflow-hidden bg-background">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          </div>
          <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl text-white">
              Crafting the Future <br />
              <span className="text-secondary-foreground">of Cinema</span>
            </h1>
          </div>
        </section>

        {/* ─── Vision & Mission ───────────────────────────── */}
        <section className="py-24 bg-background">
          <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight mb-8">The Auteur Philosophy</h2>
              <blockquote className="text-2xl text-muted-foreground font-medium leading-relaxed border-l-4 border-primary pl-6 py-2">
                &ldquo;We don&apos;t just cut clips together. We build narratives. We respect the raw material and extract the emotion hidden within the frames.&rdquo;
              </blockquote>
              <p className="mt-8 text-muted-foreground leading-relaxed">
                EdiCut was founded on a simple premise: high-end, cinematic editing should be accessible to modern creators without the overhead of hiring a full-time post-production house. We leverage bleeding-edge rendering pipelines and pair them with elite human talent to deliver uncompromising quality.
              </p>
            </div>
            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/5 h-[600px]">
              <Image src="https://images.unsplash.com/photo-1535016120720-40c746a51d45?auto=format&fit=crop&q=80" alt="Editing Suite" fill sizes="(min-width: 1024px) 50vw, 100vw" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          </div>
        </section>

        {/* ─── The Studio ─────────────────────────────────── */}
        <section className="py-32 bg-[#0A0A0A] border-t border-border/20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white tracking-tight">Inside The Studio</h2>
              <p className="mt-4 text-muted-foreground">Purpose-built environments for rendering reality.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
              {/* Large item */}
              <div className="col-span-1 md:col-span-2 row-span-2 overflow-hidden rounded-3xl bg-card border border-border/10">
                <Image src="https://images.unsplash.com/photo-1540960533014-99896431952e?auto=format&fit=crop&q=80" alt="Server Room" fill sizes="(min-width: 768px) 66vw, 100vw" className="h-full w-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" />
              </div>
              {/* Standard items */}
              <div className="relative overflow-hidden rounded-3xl bg-card border border-border/10">
                <Image src="https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?auto=format&fit=crop&q=80" alt="Color Grading" fill sizes="(min-width: 768px) 33vw, 100vw" className="h-full w-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" />
              </div>
              <div className="relative overflow-hidden rounded-3xl bg-card border border-border/10">
                <Image src="https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?auto=format&fit=crop&q=80" alt="Workstation" fill sizes="(min-width: 768px) 33vw, 100vw" className="h-full w-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Community CTA ────────────────────────────── */}
        <section className="py-32 bg-background border-t border-border/20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-5xl font-black text-white tracking-tight leading-tight">
              Join the Auteur Movement
            </h2>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Whether you are an established brand or an independent creator, your story deserves the highest fidelity available.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" className="rounded-xl h-14 px-10 text-lg font-bold shadow-[0_0_40px_-5px_rgba(34,211,238,0.3)] transition-all hover:scale-105" asChild>
                <Link href="/pricing">Explore Services</Link>
              </Button>
              <Button variant="outline" size="lg" className="rounded-xl h-14 px-10 text-lg font-bold bg-transparent border-muted-foreground/30 text-white hover:bg-white/5 transition-all hover:scale-105" asChild>
                <Link href="/contact">Contact Us <ChevronRight className="ml-2 h-5 w-5"/></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

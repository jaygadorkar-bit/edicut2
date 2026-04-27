export const runtime = "edge";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { Button } from "@/components/ui/button";
import { PlayCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function PortfolioPage() {
  const categories = ["All", "YouTube", "Commercial", "Short Film", "Social Media", "Music Video"];
  
  const projects = [
    { title: "Neon Nights", category: "Short Film", image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80", colSpan: "col-span-1 md:col-span-2", rowSpan: "row-span-2" },
    { title: "Urban Drift", category: "Commercial", image: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&q=80", colSpan: "", rowSpan: "" },
    { title: "Tech Unboxed", category: "YouTube", image: "https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?auto=format&fit=crop&q=80", colSpan: "", rowSpan: "" },
    { title: "Ocean's Echo", category: "Documentary", image: "https://images.unsplash.com/photo-1518113576008-c0b8de9bb6d8?auto=format&fit=crop&q=80", colSpan: "", rowSpan: "" },
    { title: "Midnight Pulse", category: "Music Video", image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80", colSpan: "col-span-1 md:col-span-2", rowSpan: "" },
    { title: "Brand Anthem", category: "Commercial", image: "https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?auto=format&fit=crop&q=80", colSpan: "", rowSpan: "" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        {/* ─── Hero Header ─────────────────────────────────── */}
        <section className="relative pt-32 pb-16 bg-background">
          <div className="mx-auto max-w-7xl px-6">
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl text-white">
              Our Masterpieces
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground font-medium">
              Explore the caliber of work produced by our elite editing suite. Everything you see here started as raw, uncut footage.
            </p>
          </div>
        </section>

        {/* ─── Filter Bar ──────────────────────────────────── */}
        <section className="pb-10 bg-background sticky top-20 z-40 bg-background/90 backdrop-blur-md pt-4">
          <div className="mx-auto max-w-7xl px-6 flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {categories.map((cat, idx) => (
              <button 
                key={cat} 
                className={`px-6 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${idx === 0 ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-white hover:bg-card/80 border border-border/40'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* ─── Portfolio Grid ──────────────────────────────── */}
        <section className="pb-32 bg-background">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[350px]">
              {projects.map((project, idx) => (
                <div key={idx} className={`group relative overflow-hidden rounded-3xl bg-card border border-border/20 ${project.colSpan} ${project.rowSpan}`}>
                  <Image src={project.image} alt={project.title} fill sizes="(min-width: 768px) 33vw, 100vw" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <PlayCircle className="h-20 w-20 text-white drop-shadow-2xl" />
                  </div>
                  <div className="absolute bottom-0 left-0 p-8">
                    <span className="text-primary text-xs font-bold uppercase tracking-widest mb-2 block">{project.category}</span>
                    <h3 className="text-3xl font-bold text-white group-hover:text-primary transition-colors duration-300">{project.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA Section ─────────────────────────────────── */}
        <section className="py-32 bg-[#0A0A0A] border-t border-border/20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-5xl font-black text-white tracking-tight leading-tight">
              Ready to create your own<br/>
              <span className="text-primary">Masterpiece?</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Skip the arduous search for freelancers. Instantly tap into our suite of auteur editors.
            </p>
            <div className="mt-12">
              <Button size="lg" className="rounded-xl h-14 px-10 text-lg font-bold shadow-[0_0_40px_-5px_rgba(34,211,238,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_60px_-5px_rgba(34,211,238,0.7)]" asChild>
                <Link href="/pricing">View Packages <ChevronRight className="ml-2 h-5 w-5"/></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

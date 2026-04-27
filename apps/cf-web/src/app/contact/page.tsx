export const runtime = "edge";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { Button } from "@/components/ui/button";
import { MapPin, Mail, Phone } from "lucide-react";
import Image from "next/image";

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <PublicHeader />

      <main className="flex-1">
        {/* ─── Hero Section ───────────────────────────────── */}
        <section className="relative pt-32 pb-16 bg-background">
          <div className="mx-auto max-w-7xl px-6">
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl text-white">
              Let&apos;s Direct Your <br/>
              <span className="text-secondary-foreground">Next Project</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground font-medium">
              Ready to elevate your footage? Reach out to our team of auteur editors to discuss custom pipelines, enterprise pricing, or massive projects.
            </p>
          </div>
        </section>

        {/* ─── Contact Form & Info Grid ───────────────────── */}
        <section className="py-20 bg-background">
          <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16">
            {/* Form */}
            <div className="bg-card p-10 rounded-3xl border border-border/30 shadow-2xl shadow-primary/5">
              <h2 className="text-2xl font-bold text-white mb-8">Send a Dispatch</h2>
              <form className="space-y-6">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Email</label>
                  <input 
                    type="email" 
                    className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Project Scope</label>
                  <select className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none cursor-pointer">
                    <option>Standard Package Inquiry</option>
                    <option>Custom Feature / Documentary</option>
                    <option>Enterprise Brand Campaign</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Message</label>
                  <textarea 
                    rows={5}
                    className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                    placeholder="Tell us about your raw footage and creative vision..."
                  />
                </div>
                <Button className="w-full rounded-xl h-14 font-bold text-lg shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)] transition-transform hover:scale-[1.02]">
                  Send Message
                </Button>
              </form>
            </div>

            {/* Info Grid & Map Location */}
            <div className="space-y-12">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-6 border-b border-border/20 pb-4">Direct Lines</h3>
                <div className="space-y-6">
                  <div className="flex items-start">
                    <Mail className="h-6 w-6 text-primary mr-4 mt-1" />
                    <div>
                      <p className="font-bold text-white">General Inquiries</p>
                      <p className="text-muted-foreground">hello@edicut.studio</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Phone className="h-6 w-6 text-primary mr-4 mt-1" />
                    <div>
                      <p className="font-bold text-white">Production Desk</p>
                      <p className="text-muted-foreground">+1 (555) 019-2831</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <MapPin className="h-6 w-6 text-primary mr-4 mt-1" />
                    <div>
                      <p className="font-bold text-white">Headquarters</p>
                      <p className="text-muted-foreground">Level 42, Neon District<br/>Cyber City, 90210</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Studio Image / Location */}
              <div className="relative rounded-3xl overflow-hidden h-64 border border-border/20 shadow-xl group">
                <Image src="https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&q=80" alt="Studio" fill sizes="(min-width: 1024px) 50vw, 100vw" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-300" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/80 backdrop-blur-md px-6 py-3 rounded-full border border-border/50 text-sm font-bold text-white uppercase tracking-widest">
                    Authorized Personnel Only
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

import { useState } from "react";
import { Link } from "react-router";

export function meta() {
  return [
    { title: "EdiCut | Premium Video Editing for YouTubers" },
    { name: "description", content: "Scale your channel with editors who understand the algorithm." },
  ];
}

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-[#0F0F0F] font-sans selection:bg-red-100 selection:text-red-600">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF0000] rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-xl">play_arrow</span>
            </div>
            <span className="text-xl font-black tracking-tight uppercase">EdiCut</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link to="#workflow" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Workflow</Link>
            <Link to="#portfolio" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Portfolio</Link>
            <Link to="#pricing" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Pricing</Link>
            <Link to="/login" className="px-5 py-2 text-sm font-bold bg-[#0F0F0F] text-white rounded-full hover:bg-black/90 transition-all shadow-lg shadow-black/10">Start Creating</Link>
          </div>

          <button className="md:hidden text-gray-600" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div
            className="reveal-up inline-flex items-center gap-2 px-4 py-1.5 bg-gray-50 border border-gray-100 rounded-full mb-8"
          >
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Trusted by 500+ Creators</span>
          </div>
          
          <h1
            className="reveal-up reveal-delay-100 text-5xl md:text-7xl font-black tracking-tight mb-8 leading-[1.1]"
          >
            Premium Video Editing for <span className="text-[#FF0000]">Modern Creators</span>
          </h1>
          
          <p
            className="reveal-up reveal-delay-200 text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            Scale your channel with editors who understand the algorithm. We handle the cuts, you handle the vision.
          </p>
          
          <div
            className="reveal-up reveal-delay-300 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/pricing" className="w-full sm:w-auto px-8 py-4 bg-[#FF0000] text-white font-bold rounded-2xl hover:bg-[#CC0000] transition-all shadow-xl shadow-red-500/20 text-lg flex items-center justify-center gap-2 group">
              View Packages
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
            <Link to="#portfolio" className="w-full sm:w-auto px-8 py-4 bg-white text-[#0F0F0F] font-bold rounded-2xl border border-gray-200 hover:border-gray-300 transition-all text-lg flex items-center justify-center gap-2">
              See Our Work
            </Link>
          </div>
        </div>

        {/* Hero Image / Dashboard Preview */}
        <div
          className="reveal-scale reveal-delay-400 max-w-6xl mx-auto mt-20 relative"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10" />
          <div className="rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.08)] border border-gray-100 relative w-full pt-[57.14%]">
            <img 
              src="/images/light-hero.png" 
              alt="EdiCut Dashboard" 
              className="absolute inset-0 w-full h-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="py-12 border-y border-gray-100 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Powering the biggest names on YouTube</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Logos would go here - using text for now */}
            <span className="text-2xl font-black">TECHRIVA</span>
            <span className="text-2xl font-black">VOGUE</span>
            <span className="text-2xl font-black">APEX</span>
            <span className="text-2xl font-black">LUXE</span>
            <span className="text-2xl font-black">NEON</span>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-24 bg-[#F9F9F9]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-black mb-6">How It Works</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Focus on filming, we take care of everything from ingest to the final render.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Choose Package", desc: "Select the monthly plan that fits your upload schedule and style.", icon: "stylus" },
              { step: "02", title: "Upload Footage", desc: "Drop your raw files into our secure portal. No size limits.", icon: "cloud_upload" },
              { step: "03", title: "Review & Polish", desc: "Get your first cut within 48h. Request unlimited revisions.", icon: "verified" }
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-10 rounded-[2rem] border border-black/5 shadow-sm hover:shadow-xl transition-all group">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-red-50 transition-colors">
                  <span className="material-symbols-outlined text-[#FF0000] text-3xl">{item.icon}</span>
                </div>
                <span className="text-[#FF0000] font-black text-xs uppercase tracking-widest mb-4 block">{item.step}</span>
                <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio / Bento Grid */}
      <section id="portfolio" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <h2 className="text-3xl md:text-5xl font-black mb-4">The Reel</h2>
              <p className="text-gray-500">High-retention edits that keep viewers watching until the end.</p>
            </div>
            <Link to="/showcase" className="px-6 py-3 border border-gray-200 rounded-full text-sm font-bold hover:bg-gray-50 transition-all flex items-center gap-2">
              Explore All Projects
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-auto md:h-[600px]">
            <div className="md:col-span-8 relative rounded-3xl overflow-hidden group min-h-[300px]">
              <img src="/images/the-ridge.png" alt="Short Film" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-8 flex flex-col justify-end">
                <span className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Cinematic Narrative</span>
                <h4 className="text-white text-3xl font-black">"The Ridge" - Short Film</h4>
              </div>
            </div>
            <div className="md:col-span-4 relative rounded-3xl overflow-hidden group min-h-[300px]">
              <img src="/images/neon-pulse.png" alt="Music Video" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-8 flex flex-col justify-end">
                <span className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Music Video</span>
                <h4 className="text-white text-2xl font-black">Neon Pulse - Afterhours</h4>
              </div>
            </div>
            <div className="md:col-span-4 relative rounded-3xl overflow-hidden group min-h-[300px]">
              <img src="/images/vogue.png" alt="Fashion" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-8 flex flex-col justify-end">
                <span className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Fashion</span>
                <h4 className="text-white text-2xl font-black">Vogue: Summer '25</h4>
              </div>
            </div>
            <div className="md:col-span-8 relative rounded-3xl overflow-hidden group min-h-[300px]">
              <img src="/images/apex-drive.png" alt="Commercial" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-8 flex flex-col justify-end">
                <span className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Commercial</span>
                <h4 className="text-white text-3xl font-black">Apex Drive - Speed Redefined</h4>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-[#0F0F0F] text-white rounded-[4rem] mx-4">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-black mb-6">Investment</h2>
            <p className="text-gray-400">Simple flat-rate pricing. No hidden fees or surprise costs.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: "Starter", price: "$999", feat: ["4 Videos / Month", "48h Turnaround", "Unlimited Revisions", "Basic Color Grading"] },
              { name: "Growth", price: "$1,999", feat: ["8 Videos / Month", "24h Turnaround", "Motion Graphics", "Algorithm Optimization"], popular: true },
              { name: "Pro", price: "$3,999", feat: ["Unlimited Videos", "Priority Queue", "Thumbnail Design", "Full Channel Management"] }
            ].map((plan, idx) => (
              <div key={idx} className={`relative p-10 rounded-[2.5rem] border ${plan.popular ? 'border-[#FF0000] bg-white text-[#0F0F0F]' : 'border-white/10 bg-white/5'} transition-all`}>
                {plan.popular && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#FF0000] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">Most Popular</span>
                )}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-sm opacity-60">/mo</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {plan.feat.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm font-medium">
                      <span className="material-symbols-outlined text-[#FF0000] text-lg">check_circle</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-4 rounded-2xl font-bold transition-all ${plan.popular ? 'bg-[#FF0000] text-white shadow-xl shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black mb-12 text-center">Common Questions</h2>
          <div className="space-y-6">
            {[
              { q: "How fast will I get my video?", a: "Most edits are delivered within 48 hours. Our Growth and Pro plans include 24-hour priority turnaround." },
              { q: "Can I use my own music?", a: "Absolutely. You can provide tracks, or we can source royalty-free music from our licensed libraries." },
              { q: "What if I don't like the first cut?", a: "We offer unlimited revisions. We won't stop until you're 100% satisfied with the result." }
            ].map((faq, idx) => (
              <div key={idx} className="p-8 rounded-3xl border border-gray-100 hover:border-gray-200 transition-all bg-white shadow-sm">
                <h4 className="text-lg font-bold mb-4 flex items-center justify-between">
                  {faq.q}
                  <span className="material-symbols-outlined text-gray-300">add</span>
                </h4>
                <p className="text-gray-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer / Final CTA */}
      <footer className="pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#FF0000] rounded-[3rem] p-12 md:p-24 text-center text-white mb-20 shadow-2xl shadow-red-500/30">
            <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">Ready to Win the <br className="hidden md:block"/> Algorithm?</h2>
            <Link to="/login" className="inline-flex items-center gap-2 px-10 py-5 bg-white text-[#FF0000] font-black rounded-2xl text-xl hover:scale-105 transition-all shadow-xl">
              Start Your Project
              <span className="material-symbols-outlined">rocket_launch</span>
            </Link>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-12 border-t border-gray-100 pt-12">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#FF0000] rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-xl">play_arrow</span>
              </div>
              <span className="text-xl font-black tracking-tight uppercase">EdiCut</span>
            </Link>
            
            <div className="flex gap-8 text-sm font-bold text-gray-400">
              <Link to="#" className="hover:text-black transition-colors">Twitter</Link>
              <Link to="#" className="hover:text-black transition-colors">Instagram</Link>
              <Link to="#" className="hover:text-black transition-colors">LinkedIn</Link>
            </div>

            <p className="text-sm text-gray-400 font-medium">&copy; 2026 EdiCut Studios. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

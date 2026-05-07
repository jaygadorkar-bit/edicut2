import { Link } from "react-router";

export function HeroSection() {
  return (
    <section className="hero-grid overflow-hidden px-5 pb-16 pt-28 sm:px-6 lg:pb-20 lg:pt-32">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="min-w-0 max-w-[calc(100vw-2.5rem)] lg:max-w-none">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Editing built for YouTubers
          </div>

          <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Publish better videos without living in the timeline.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            EdiCut gives creators a clean editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables.
          </p>

          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-black text-white shadow-xl shadow-red-500/20 [#D90000]"
            >
              Compare packages
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </a>
            <a
              href="#portfolio"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-7 py-4 text-base font-black text-foreground shadow-sm secondary"
            >
              Watch the reel
              <span className="material-symbols-outlined text-[20px]">play_circle</span>
            </a>
          </div>

          <div className="mt-10 grid max-w-xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] divide-x divide-gray-200 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="min-w-0 px-2 sm:px-3">
              <p className="text-2xl font-black">48h</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">First cuts</p>
            </div>
            <div className="min-w-0 px-2 sm:px-3">
              <p className="text-2xl font-black">500+</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">Videos</p>
            </div>
            <div className="min-w-0 px-2 sm:px-3">
              <p className="text-2xl font-black">4.9</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">Rating</p>
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-[calc(100vw-2.5rem)] lg:max-w-none">
          <div className="relative rounded-2xl border border-black/5 bg-white p-2 shadow-2xl shadow-black/10">
            <img
              src="/images/hero-suite.png"
              alt="EdiCut editing suite preview"
              className="aspect-[16/11] w-full rounded-xl object-cover"
              fetchPriority="high"
              decoding="async"
            />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/30 bg-white/85 p-4 shadow-lg backdrop-blur-xl sm:left-7 sm:right-auto sm:w-80">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Current edit</p>
                  <p className="mt-1 text-lg font-black">Retention pass</p>
                </div>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-primary">
                  72%
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full w-[72%] rounded-full bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { portfolioItems } from "./data";

export function PortfolioGrid() {
  return (
    <section id="portfolio" className="bg-foreground px-5 py-20 text-white sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Portfolio</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Proof across formats.</h2>
          </div>
          <p className="max-w-xl leading-7 text-gray-400">
            A bento-style reel for cinematic stories, music videos, fashion cuts, and high-energy commercial edits.
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[260px] gap-4 md:grid-cols-12">
          {portfolioItems.map((item) => (
            <article key={item.title} className={`group relative overflow-hidden rounded-2xl bg-slate-800 ${item.className}`}>
              <img
                src={item.image}
                alt={`${item.title} video edit`}
                className="h-full w-full object-cover group-"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">{item.type}</p>
                <h3 className="mt-2 text-3xl font-black">{item.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

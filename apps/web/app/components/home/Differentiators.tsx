import { differentiators } from "./data";

export function Differentiators() {
  return (
    <section className="px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Why EdiCut</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Built for retention, not just clean cuts.</h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground lg:ml-auto">
            The design preference is minimal and YouTube-native, but the product promise is operational: faster publishing, better viewer flow, and fewer editing bottlenecks.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {differentiators.map((item) => (
            <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <span className="material-symbols-outlined">{item.icon}</span>
              </span>
              <h3 className="mt-6 text-xl font-black">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

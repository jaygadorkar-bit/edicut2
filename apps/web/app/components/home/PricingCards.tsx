import { useState } from "react";
import { pricingPlans } from "./data";

export function PricingCards() {
  const [isMonthly, setIsMonthly] = useState(true);

  return (
    <section id="pricing" className="bg-secondary px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Packages</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Choose the right editing lane.</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Marketplace-style packages for creators who want clear scope, delivery speed, and predictable monthly output.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="flex cursor-pointer rounded-full border border-gray-200 bg-white p-1 text-sm font-black transition-colors" onClick={() => setIsMonthly(!isMonthly)}>
            <span className={`inline-flex rounded-full px-4 py-2 ${isMonthly ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground"}`}>Monthly</span>
            <span className={`inline-flex rounded-full px-4 py-2 ${!isMonthly ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground"}`}>One-off</span>
          </div>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => {
            let displayPrice = plan.price;
            let displayInterval = "/mo";
            let displayFeatures = plan.features;

            if (!isMonthly) {
              displayInterval = "";
              const numericPrice = parseInt(plan.price.replace(/[^0-9]/g, ""), 10);
              if (!isNaN(numericPrice)) {
                let div = 4;
                if (plan.features[0]?.includes("8")) div = 8;
                if (plan.features[0]?.includes("12")) div = 12;
                const singlePrice = Math.floor(numericPrice / div * 1.2);
                displayPrice = `$${Math.floor(singlePrice / 10) * 10 + 9}`;
              }
              displayFeatures = plan.features.map(f =>
                f.replace("4 videos monthly", "1 video")
                 .replace("8 videos monthly", "1 video")
                 .replace("12+ videos monthly", "1 video")
              );
            }

            return (
            <article
              key={plan.name}
              className={`relative rounded-2xl border bg-white p-7 shadow-sm ${
                plan.popular ? "border-primary shadow-xl shadow-red-500/10" : "border-gray-200"
              }`}
            >
              {plan.popular ? (
                <span className="absolute right-5 top-5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
                  Popular
                </span>
              ) : null}
              <h3 className="text-2xl font-black">{plan.name}</h3>
              <p className="mt-3 min-h-14 leading-7 text-muted-foreground">{plan.description}</p>
              <div className="mt-8 flex items-end gap-2">
                <span className="text-5xl font-black">{displayPrice}</span>
                <span className="pb-1 text-sm font-bold text-muted-foreground">{isMonthly ? "/mo" : "/project"}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {displayFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm font-bold text-slate-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-primary">
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-5 py-4 text-sm font-black ${
                  plan.popular
                    ? "bg-primary text-white [#D90000]"
                    : "bg-foreground text-white slate-800"
                }`}
              >
                Start with {plan.name}
              </a>
            </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

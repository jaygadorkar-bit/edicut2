import { pricingPlans } from "./data";

export function PricingCards() {
  return (
    <section id="pricing" className="bg-[#F9F9F9] px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF0000]">Packages</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Choose the right editing lane.</h2>
          <p className="mt-5 text-lg leading-8 text-[#717171]">
            Marketplace-style packages for creators who want clear scope, delivery speed, and predictable monthly output.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <article
              key={plan.name}
              className={`relative rounded-2xl border bg-white p-7 shadow-sm ${
                plan.popular ? "border-[#FF0000] shadow-xl shadow-red-500/10" : "border-gray-200"
              }`}
            >
              {plan.popular ? (
                <span className="absolute right-5 top-5 rounded-full bg-[#FF0000] px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
                  Popular
                </span>
              ) : null}
              <h3 className="text-2xl font-black">{plan.name}</h3>
              <p className="mt-3 min-h-14 leading-7 text-[#717171]">{plan.description}</p>
              <div className="mt-8 flex items-end gap-2">
                <span className="text-5xl font-black">{plan.price}</span>
                <span className="pb-1 text-sm font-bold text-[#717171]">/mo</span>
              </div>
              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm font-bold text-[#282828]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-[#FF0000]">
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
                    ? "bg-[#FF0000] text-white [#D90000]"
                    : "bg-[#0F0F0F] text-white [#282828]"
                }`}
              >
                Start with {plan.name}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

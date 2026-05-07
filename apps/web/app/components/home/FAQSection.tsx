import { faqs } from "./data";

export function FAQSection() {
  return (
    <section id="faq" className="px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">FAQ</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Answers before you send footage.</h2>
        </div>
        <div className="grid gap-4">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-start justify-between gap-4 text-xl font-black">
                {faq.question}
                <span className="material-symbols-outlined text-primary">add_circle</span>
              </h3>
              <p className="mt-3 leading-7 text-muted-foreground">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

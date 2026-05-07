import { testimonials } from "./data";

export function Testimonials() {
  return (
    <section className="px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF0000]">Creator feedback</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Less edit stress. More publishing momentum.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-[#F9F9F9] p-5">
              <p className="text-3xl font-black">50M+</p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#717171]">Views edited for</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-[#F9F9F9] p-5">
              <p className="text-3xl font-black">96%</p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#717171]">On-time delivery</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-[#F9F9F9] p-5">
              <p className="text-3xl font-black">3.2x</p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#717171]">Clip output lift</p>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((item) => (
            <article key={item.name} className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex gap-1 text-[#FF0000]">
                {[0, 1, 2, 3, 4].map((star) => (
                  <span key={star} className="material-symbols-outlined text-[18px]">star</span>
                ))}
              </div>
              <p className="mt-6 min-h-32 text-lg leading-8 text-[#282828]">"{item.quote}"</p>
              <div className="mt-8 border-t border-gray-100 pt-5">
                <p className="font-black">{item.name}</p>
                <p className="mt-1 text-sm text-[#717171]">{item.role}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

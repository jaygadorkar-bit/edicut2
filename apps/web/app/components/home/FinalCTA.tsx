import { Link } from "react-router";

export function FinalCTA() {
  return (
    <section id="contact" className="px-5 pb-10 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-[#0F0F0F] px-6 py-16 text-center text-white shadow-2xl shadow-black/20 sm:px-10 lg:py-20">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-red-200">Final CTA</p>
        <h2 className="mx-auto mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
          Ready to make your next upload easier to finish?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-300">
          Pick a package, upload your footage, and get a review-ready cut without rebuilding your workflow from scratch.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="#pricing"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF0000] px-7 py-4 font-black text-white transition hover:bg-[#D90000]"
          >
            View pricing
            <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
          </a>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 font-black text-[#0F0F0F] transition hover:bg-gray-100"
          >
            Login/Signup
            <span className="material-symbols-outlined text-[20px]">login</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

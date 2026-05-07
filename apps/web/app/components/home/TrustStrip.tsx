import { trustLogos } from "./data";

export function TrustStrip() {
  return (
    <section className="border-y border-gray-100 bg-white px-5 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-black uppercase tracking-[0.18em] text-[#717171]">
          Trusted by creator teams, editors, and media operators
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-5 text-xl font-black tracking-tight text-[#282828]/45">
          {trustLogos.map((logo) => (
            <span key={logo}>{logo}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

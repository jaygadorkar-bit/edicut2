import { useState } from "react";
import { Link, useMatches } from "react-router";
import { navLinks } from "../site/data";

export function LogoMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF0000] text-white shadow-lg shadow-red-500/20">
        <span className="material-symbols-outlined text-[22px]">play_arrow</span>
      </span>
      <span className="text-xl font-black uppercase tracking-tight">EdiCut</span>
    </span>
  );
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSignedIn = useMatches().some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  return (
    <nav className="glass-nav fixed left-0 top-0 z-50 w-full border-b border-black/5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
          <LogoMark />
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/70 p-1 md:flex">
          {navLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-4 py-2 text-sm font-bold text-[#717171] transition hover:bg-[#F9F9F9] hover:text-[#0F0F0F]"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center md:flex">
          <Link
            to={isSignedIn ? "/dashboard" : "/signin"}
            className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black shadow-lg transition ${
              isSignedIn
                ? "border border-black/5 bg-[#0F0F0F] text-white shadow-black/10 hover:-translate-y-0.5 hover:bg-[#1A1A1A] hover:shadow-black/15"
                : "border border-[#FF0000]/10 bg-gradient-to-r from-[#FF0000] to-[#D90000] text-white shadow-red-500/20 hover:-translate-y-0.5 hover:from-[#D90000] hover:to-[#A80000] hover:shadow-red-500/30"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                isSignedIn ? "bg-white/10 text-white" : "bg-white/15 text-white"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSignedIn ? "space_dashboard" : "login"}
              </span>
            </span>
            {isSignedIn ? "Dashboard" : "Sign in / Sign up"}
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
              {isSignedIn ? "arrow_forward" : "chevron_right"}
            </span>
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-[#282828] md:hidden"
        >
          <span className="material-symbols-outlined">{isMenuOpen ? "close" : "menu"}</span>
        </button>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-black/5 bg-white/95 px-5 py-4 shadow-xl md:hidden">
          <div className="mx-auto grid max-w-7xl gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-bold text-[#282828] hover:bg-[#F9F9F9]"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to={isSignedIn ? "/dashboard" : "/signin"}
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0000] to-[#D90000] px-3 py-3 text-center text-sm font-black text-white shadow-lg shadow-red-500/20"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSignedIn ? "space_dashboard" : "login"}
              </span>
              {isSignedIn ? "Dashboard" : "Sign in / Sign up"}
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

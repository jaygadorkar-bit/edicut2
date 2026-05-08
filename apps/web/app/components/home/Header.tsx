import { useState } from "react";
import { Link, NavLink, useMatches } from "react-router";
import { navLinks } from "../site/data";

export function LogoMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-red-500/20 transition-transform hover:scale-105 active:scale-95">
        <span className="material-symbols-outlined text-[24px]">play_arrow</span>
      </span>
      <span className="text-xl font-black uppercase tracking-tight text-foreground">EdiCut</span>
    </span>
  );
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const matches = useMatches();
  const rootData = matches.find((m) => m.id === "root")?.data as { promoBarSettings?: { enabled: boolean; message: string } } | undefined;
  const isSignedIn = matches.some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  const promoEnabled = rootData?.promoBarSettings?.enabled;
  const promoMessage = rootData?.promoBarSettings?.message;

  return (
    <>
      {promoEnabled && promoMessage ? (
        <div className="fixed left-0 top-0 z-[60] flex h-10 w-full items-center justify-center bg-foreground px-4 text-center text-[11px] font-black uppercase tracking-widest text-white shadow-md">
          {promoMessage}
        </div>
      ) : null}
      
      <nav className={`glass-nav fixed left-0 ${promoEnabled && promoMessage ? "top-10" : "top-0"} z-50 w-full border-b border-black/5 transition-all duration-300`}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <LogoMark />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/60 p-1.5 backdrop-blur-md md:flex">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-5 py-2 text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-foreground text-white shadow-sm shadow-black/10"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              to={isSignedIn ? "/dashboard" : "/signin"}
              className={`group inline-flex items-center gap-2 rounded-full px-7 py-3 text-[11px] font-black uppercase tracking-wider shadow-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 ${
                isSignedIn
                  ? "border border-black/5 bg-white text-foreground shadow-black/5 hover:bg-black/5"
                  : "bg-primary text-white shadow-primary/25 hover:bg-primary/90"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                  isSignedIn ? "bg-black/5 text-foreground" : "bg-white/20 text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {isSignedIn ? "space_dashboard" : "person"}
                </span>
              </span>
              {isSignedIn ? "Go to Dashboard" : "Get Started"}
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/5 bg-white/50 text-slate-900 shadow-sm md:hidden"
          >
            <span className="material-symbols-outlined text-[24px]">
              {isMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

        {/* Mobile Navigation */}
        <div 
          className={`overflow-hidden transition-all duration-300 ease-in-out md:hidden ${
            isMenuOpen ? "max-h-[500px] border-t border-black/5 opacity-100" : "max-h-0 opacity-0"
          } bg-white/95 backdrop-blur-xl shadow-2xl`}
        >
          <div className="mx-auto grid max-w-7xl gap-2 p-6">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-2xl px-5 py-4 text-base font-bold transition-colors ${
                    isActive
                      ? "bg-black/5 text-foreground"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                  }`
                }
              >
                {item.label}
                <span className="material-symbols-outlined text-[20px] opacity-20">arrow_forward</span>
              </NavLink>
            ))}
            <Link
              to={isSignedIn ? "/dashboard" : "/signin"}
              onClick={() => setIsMenuOpen(false)}
              className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-center text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSignedIn ? "space_dashboard" : "login"}
              </span>
              {isSignedIn ? "Dashboard" : "Sign in"}
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}

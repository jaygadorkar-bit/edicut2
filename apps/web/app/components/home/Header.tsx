import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useMatches } from "react-router";
import { authHref } from "../auth/AuthModal";
import { navLinks } from "../site/data";

export function LogoMark({ className = "h-10" }: { className?: string }) {
  return <img src="/icons/edicut-logo.svg" alt="EdiCut" className={`${className} w-auto`} />;
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const matches = useMatches();
  const location = useLocation();
  const rootData = matches.find((m) => m.id === "root")?.data as { promoBarSettings?: { enabled: boolean; message: string } } | undefined;
  const isSignedIn = matches.some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  const promoEnabled = rootData?.promoBarSettings?.enabled;
  const promoMessage = rootData?.promoBarSettings?.message;

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <>
      {promoEnabled && promoMessage ? (
        <div className="flex h-10 w-full items-center justify-center bg-[#F7F8F9] px-4 text-center text-[11px] font-black uppercase tracking-widest text-foreground">
          {promoMessage}
        </div>
      ) : null}
      
      <nav className="glass-nav sticky relative top-0 z-50 w-full border-b border-black/5 px-4 transition-all duration-300 sm:px-6">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <LogoMark className="h-11 sm:h-12" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-0.5 rounded-full border border-black/5 bg-white/60 p-1 backdrop-blur-md lg:flex">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-[13px] font-bold transition-all duration-200 ${
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

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signin")}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white transition-colors">
                <span className="material-symbols-outlined text-[13px]">
                  {isSignedIn ? "dashboard_customize" : "person"}
                </span>
              </span>
              {isSignedIn ? "Dashboard" : "Sign in"}
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation-drawer"
            onClick={() => setIsMenuOpen((value) => !value)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white/70 text-slate-900 shadow-sm transition hover:bg-white lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

        {/* Compact navigation drawer for mobile and tablet widths */}
      </nav>

      <div
        aria-hidden={!isMenuOpen}
        className={`fixed inset-0 z-[100] overflow-hidden lg:hidden ${
          isMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          onClick={() => setIsMenuOpen(false)}
          className={`absolute inset-0 bg-slate-950/25 backdrop-blur-[2px] transition-opacity duration-300 ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          id="mobile-navigation-drawer"
          role="dialog"
          aria-label="Mobile navigation"
          aria-hidden={!isMenuOpen}
          className={`absolute right-0 top-0 z-10 flex h-full w-[min(88vw,380px)] flex-col border-l border-black/5 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
            isMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-[72px] shrink-0 items-center justify-end border-b border-black/5 px-5 sm:px-6">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/5 bg-white text-slate-900 shadow-sm transition hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5 sm:p-6">
            <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Explore EdiCut</p>
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-foreground text-white shadow-sm"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                  }`
                }
              >
                {item.label}
                <span className="material-symbols-outlined text-[18px] opacity-50">arrow_forward</span>
              </NavLink>
            ))}
          </div>

          <div className="border-t border-black/5 p-5 sm:p-6">
            <Link
              to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signin")}
              onClick={() => setIsMenuOpen(false)}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-center text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-primary/20 transition-transform hover:bg-primary/90 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[19px]">
                {isSignedIn ? "dashboard_customize" : "login"}
              </span>
              {isSignedIn ? "Dashboard" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

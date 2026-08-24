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
      
      <header className="neo-site-header sticky relative top-0 z-50 w-full border-b px-4 transition-all duration-300 sm:px-6">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <LogoMark className="h-11 sm:h-12" />
          </Link>

          {/* Desktop Navigation */}
          <div className="neo-header-nav hidden items-center gap-0.5 rounded-full border p-1 backdrop-blur-md lg:flex">
            {navLinks.map((item) => (
              <a
                key={item.to}
                href={item.to}
                className="neo-header-link rounded-full px-4 py-2 text-[13px] font-bold transition-all duration-200 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signin")}
              className="neo-button neo-button--primary neo-button--compact uppercase tracking-[0.12em]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-current transition-colors">
                <span className="material-symbols-outlined text-[13px] text-current">
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
            className="neo-header-menu flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
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
          className={`neo-header-drawer absolute right-0 top-0 z-10 flex h-full w-[min(88vw,380px)] flex-col border-l shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
            isMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="neo-header-drawer-head flex h-[72px] shrink-0 items-center justify-end border-b px-5 sm:px-6">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsMenuOpen(false)}
              className="neo-header-menu flex h-10 w-10 items-center justify-center rounded-xl border transition"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5 sm:p-6">
            <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Explore EdiCut</p>
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.to}
                onClick={() => setIsMenuOpen(false)}
                className="neo-header-link flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition-colors hover:bg-black/5"
              >
                {item.label}
                <span className="material-symbols-outlined text-[18px] opacity-50">arrow_forward</span>
              </a>
            ))}
          </div>

          <div className="border-t border-black/5 p-5 sm:p-6">
            <Link
              to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signin")}
              onClick={() => setIsMenuOpen(false)}
              className="neo-button neo-button--primary w-full uppercase tracking-[0.14em]"
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

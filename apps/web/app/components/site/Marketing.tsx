import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useMatches, useNavigation, useSubmit } from "react-router";
import { Award, BadgeCheck, CalendarDays, CircleHelp, Film, MessageCircle, Star, Trophy, Workflow, type LucideIcon } from "lucide-react";
import { authHref } from "../auth/AuthModal";
import { executeInvisibleRecaptcha } from "../../lib/recaptcha.client";
import { formatPackagePrice, parsePackagePrice, SUBSCRIPTION_PACKAGES } from "../../lib/subscriptions";
import { faqs, legalLinks, navLinks, testimonials, workflow } from "./data";
import { defaultPortfolioSections } from "../../lib/portfolio-demo";
import { wrapLoopPosition } from "../../lib/portfolio-loop";
import { CookieConsent } from "./CookieConsent.js";
import { ContactPageIntro } from "./ContactPageIntro";
import { DEFAULT_CONTACT_EMAIL } from "../../lib/contact-email";
import { CONTACT_WHATSAPP_DISPLAY_NUMBER, CONTACT_WHATSAPP_URL } from "../../lib/contact-details";
import type { PortfolioSection as PortfolioSectionView, PortfolioVideo } from "../../lib/portfolio.server";

export { WhyHireUsSection } from "./WhyHireUsSection";

type PricingPlanView = {
  name: string;
  slug: string;
  price: string;
  interval?: string;
  description: string;
  features: string[];
  popular?: boolean;
  badge?: string;
};

function sortByConfiguredPricingOrder<T extends { slug: string }>(items: T[], plans?: PricingPlanView[]) {
  if (!plans) return items;
  const configuredOrder = new Map(plans.map((plan, index) => [plan.slug, index]));
  return [...items].sort((a, b) =>
    (configuredOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (configuredOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER),
  );
}

const PortfolioCopyContext = createContext(false);

export function Logo({ className = "h-10" }: { className?: string }) {
  return (
    <img src="/icons/edicut-logo.svg" alt="EdiCut" width="1162" height="506" className={`${className} w-auto`} />
  );
}

export function SiteHeader() {
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
        <div className="neo-promo-bar flex h-10 w-full items-center justify-center px-4 text-center yt-small font-black uppercase tracking-widest text-foreground">
          {promoMessage}
        </div>
      ) : null}
      
      <header className="neo-site-header sticky relative top-0 z-50 w-full border-b px-4 transition-all duration-300 sm:px-6">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 sm:h-[72px] sm:gap-4">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <Logo className="h-9 sm:h-12" />
          </Link>

          <nav className="neo-header-nav hidden items-center gap-0.5 rounded-full border p-1 backdrop-blur-md lg:absolute lg:left-1/2 lg:flex lg:-translate-x-1/2">
            {navLinks.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `neo-header-link type-control rounded-full px-4 py-2 transition-all duration-200 hover:text-foreground ${isActive ? "neo-header-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signin")}
              className="neo-button neo-button--primary neo-button--compact neo-header-sign-in uppercase tracking-[0.12em]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-current transition-colors">
                <span className="material-symbols-outlined text-[13px] text-current">
                  {isSignedIn ? "dashboard_customize" : "person"}
                </span>
              </span>
              {isSignedIn ? "Dashboard" : "Sign in"}
            </Link>
          </div>

          <button
            type="button"
            aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMenuOpen}
            aria-controls="site-mobile-navigation-drawer"
            onClick={() => setIsMenuOpen((value) => !value)}
            className="neo-header-menu flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

      </header>

      <div
        aria-hidden={!isMenuOpen}
        className={`neo-header-drawer-overlay fixed inset-0 z-[100] overflow-hidden lg:hidden ${
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
          id="site-mobile-navigation-drawer"
          role="dialog"
          aria-label="Mobile navigation"
          aria-hidden={!isMenuOpen}
            className={`neo-header-drawer absolute right-0 top-0 z-10 flex h-full w-[min(88vw,380px)] flex-col border-l shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
            isMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="neo-header-drawer-head flex h-16 shrink-0 items-center justify-end border-b px-5 sm:h-[72px] sm:px-6">
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
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) => `neo-header-link type-menu flex min-h-12 items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-black/5 ${isActive ? "neo-header-active" : ""}`}
              >
                {item.label}
                <span className="material-symbols-outlined text-[18px] opacity-50">arrow_forward</span>
              </NavLink>
            ))}
          </div>

          <div className="border-t border-black/5 p-5 sm:p-6">
            <MobileSupportMenu isMenuOpen={isMenuOpen} />
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

function MobileSupportMenu({ isMenuOpen }: { isMenuOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!isMenuOpen) setIsOpen(false);
  }, [isMenuOpen]);

  return (
    <div className="neo-mobile-support sm:hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((value) => !value)}
        className="neo-button neo-button--primary neo-mobile-support-trigger w-full justify-center uppercase tracking-[0.14em]"
      >
        <span className="material-symbols-outlined text-[19px]" aria-hidden="true">chat_bubble_outline</span>
        Chat with us
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{isOpen ? "expand_more" : "expand_less"}</span>
      </button>
      <div id={panelId} hidden={!isOpen} className="neo-mobile-support-card rounded-2xl p-2">
        <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="neo-button neo-button--primary neo-mobile-whatsapp-link w-full justify-center gap-2">
          <span className="material-symbols-outlined text-[19px]" aria-hidden="true">chat</span>
          WhatsApp
        </a>
      </div>
    </div>
  );
}

function LegacySiteFooter() {
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "verified" | "error">("idle");

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    setNewsletterStatus("idle");

    try {
      await executeInvisibleRecaptcha(form, "newsletter_signup");
      setNewsletterStatus("verified");
      form.reset();
    } catch {
      setNewsletterStatus("error");
    }
  }

  return (
    <footer className="border-t border-gray-100 bg-white px-5 py-16 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[2fr_0.8fr_0.8fr_1.4fr]">
          {/* Brand & Newsletter */}
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link to="/"><Logo className="h-20" /></Link>
              <p className="yt-small leading-6 text-muted-foreground max-w-sm">
                The high-retention editing partner for modern YouTubers. Scale your channel without living in the timeline.
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="yt-tag font-black uppercase tracking-widest text-foreground">Join the waitlist</h4>
              <form className="flex gap-2" onSubmit={handleNewsletterSubmit}>
                <input type="hidden" name="g-recaptcha-response" value="" />
                <input 
                  type="email" 
                  name="email"
                  placeholder="Email address" 
                  required
                  autoComplete="email"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 yt-small font-medium outline-none focus:border-primary"
                />
                <button type="submit" className="flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90">
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </form>
              {newsletterStatus === "verified" ? <p className="yt-tag font-black text-primary">Security check passed.</p> : null}
              {newsletterStatus === "error" ? <p className="yt-tag font-black text-[#D90000]">Security check failed. Please try again.</p> : null}
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-6">
            <h4 className="yt-tag font-black uppercase tracking-widest text-foreground">Services</h4>
            <nav className="flex flex-col gap-4 yt-small font-bold text-muted-foreground">
              {navLinks.map((item) => (
                <Link key={item.label} to={item.to} className="hover:text-primary transition-colors">{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-6">
            <h4 className="yt-tag font-black uppercase tracking-widest text-foreground">Company</h4>
            <nav className="flex flex-col gap-4 yt-small font-bold text-muted-foreground">
              {legalLinks.map((item) => (
                <Link key={item.label} to={item.to} className="hover:text-primary transition-colors">{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* Contact & Payments */}
          <div className="space-y-8 lg:text-right">
            <div className="space-y-6">
              <h4 className="yt-tag font-black uppercase tracking-widest text-foreground">Get in touch</h4>
              <div className="flex flex-col gap-4 lg:items-end">
                <a href={`mailto:${DEFAULT_CONTACT_EMAIL}`} className="flex items-center gap-3 yt-small font-bold text-muted-foreground hover:text-primary transition-colors lg:flex-row-reverse">
                  <span className="neo-icon-badge flex h-8 w-8 items-center justify-center rounded-lg">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                  </span>
                  {DEFAULT_CONTACT_EMAIL}
                </a>
                <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 yt-small font-bold text-muted-foreground hover:text-primary transition-colors lg:flex-row-reverse">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366]">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.12.554 4.189 1.605 6.006L0 24l6.117-1.604a11.845 11.845 0 005.932 1.577h.005c6.632 0 12.028-5.398 12.03-12.033a11.85 11.85 0 00-3.502-8.504z"/>
                    </svg>
                  </span>
                  WhatsApp Support
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="yt-tag font-black uppercase tracking-widest text-foreground">Supported Payments</h4>
              <div className="flex gap-3 lg:justify-end">
                {/* Visa */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.7561 0.399902H4.04365C2.03126 0.399902 0.399902 1.98297 0.399902 3.93579V36.864C0.399902 38.8168 2.03126 40.3999 4.04365 40.3999H60.7561C62.7685 40.3999 64.3999 38.8168 64.3999 36.864V3.93579C64.3999 1.98297 62.7685 0.399902 60.7561 0.399902Z" fill="white" stroke="black" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M27.7653 12.8453L25.3051 27.9653H29.2413L31.7019 12.8453H27.7653ZM21.9932 12.8453L18.2403 23.2447L17.7963 21.0054L17.7967 21.0061L17.6988 20.5042C17.2446 19.5253 16.1927 17.6649 14.2063 16.0772C13.6505 15.6341 13.0653 15.2292 12.4548 14.8652L15.8657 27.9653H19.9669L26.2298 12.8453H21.9932ZM37.3557 17.0429C37.3557 15.3335 41.1893 15.5531 42.8738 16.4814L43.4355 13.234C43.4355 13.234 41.7019 12.5747 39.8949 12.5747C37.9414 12.5747 33.3026 13.429 33.3026 17.5801C33.3026 21.4867 38.7472 21.5353 38.7472 23.5863C38.7472 25.6374 33.8639 25.2708 32.2524 23.977L31.6667 27.3712C31.6667 27.3712 33.4243 28.2255 36.1104 28.2255C38.7962 28.2255 42.8493 26.8341 42.8493 23.0492C42.8493 19.1181 37.3557 18.752 37.3557 17.0429ZM53.4185 12.8453H50.2537C48.7923 12.8453 48.4364 13.9721 48.4364 13.9721L42.5662 27.9653H46.669L47.4897 25.7196H52.4939L52.9556 27.9653H56.5699L53.4185 12.8453ZM48.6241 22.6168L50.6925 16.9585L51.8562 22.6168H48.6241Z" fill="#005BAC"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M16.5257 14.2689C16.5257 14.2689 16.3627 12.9043 14.6233 12.9043H8.30376L8.22974 13.1608C8.22974 13.1608 11.2674 13.78 14.1817 16.1C16.9667 18.3173 17.8752 21.0813 17.8752 21.0813L16.5257 14.2689Z" fill="#F6AC1D"/>
                </svg>
                {/* Mastercard */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.7562 0.399902H4.04365C2.03126 0.399902 0.399902 1.98297 0.399902 3.93579V36.864C0.399902 38.8168 2.03126 40.3999 4.04365 40.3999H60.7562C62.7685 40.3999 64.3999 38.8168 64.3999 36.864V3.93579C64.3999 1.98297 62.7685 0.399902 60.7562 0.399902Z" fill="white" stroke="black" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M34.8885 15.2685C34.8885 21.0061 30.2365 25.659 24.498 25.659C18.7584 25.659 14.1064 21.007 14.1064 15.2685C14.1064 9.52891 18.7584 4.87695 24.498 4.87695C30.2355 4.87695 34.8885 9.52891 34.8885 15.2685Z" fill="#F72000"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M49.769 15.2685C49.769 21.0061 45.117 25.659 39.3785 25.659C33.6389 25.659 28.9869 21.007 28.9869 15.2685C28.9869 9.52891 33.6389 4.87695 39.3785 4.87695C45.1161 4.87695 49.769 9.52891 49.769 15.2685Z" fill="#FFBB00"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M34.8885 15.2685C34.8885 21.0061 30.2365 25.659 24.498 25.659C18.7584 25.659 14.1064 21.007 14.1064 15.2685C14.1064 9.52891 18.7584 4.87695 24.498 4.87695C30.2355 4.87695 34.8885 9.52891 34.8885 15.2685Z" fill="#F72000" fillOpacity="0.378"/>
                  <path d="M7.09351 28.0251H9.46842L10.3848 32.7468L11.2978 28.0251H13.665V35.786H12.1903V29.8673L11.0471 35.786H9.71137L8.57165 29.8673V35.786H7.09351V28.0251ZM16.184 31.9848L14.6334 31.7674C14.6922 31.4073 14.7766 31.1242 14.8865 30.9181C14.9974 30.7109 15.1559 30.5331 15.3631 30.3803C15.5114 30.2716 15.716 30.1866 15.9768 30.1266C16.2368 30.0666 16.5181 30.0361 16.8208 30.0361C17.3075 30.0361 17.6988 30.0723 17.9929 30.1448C18.2878 30.2172 18.5333 30.3678 18.7302 30.5977C18.8683 30.7562 18.9774 30.9816 19.0567 31.2726C19.1368 31.5636 19.1761 31.8421 19.1761 32.1059V34.5891C19.1761 34.8541 19.1897 35.0613 19.2144 35.2119C19.24 35.3613 19.2945 35.5516 19.3798 35.7848H17.8573C17.8102 35.6796 17.7703 35.5689 17.738 35.4542C17.7129 35.3373 17.6944 35.2181 17.6826 35.0975C17.4695 35.3693 17.2581 35.5629 17.0484 35.6795C16.7296 35.8426 16.39 35.9218 16.0484 35.9128C15.5438 35.9128 15.1602 35.7577 14.8985 35.4463C14.7735 35.305 14.6736 35.1289 14.6058 34.9304C14.538 34.7319 14.5041 34.516 14.5064 34.2981C14.5064 33.8712 14.6001 33.5202 14.7885 33.245C14.9778 32.9688 15.3256 32.7649 15.8328 32.6302C16.2296 32.5302 16.6244 32.4165 17.0168 32.2894C17.1975 32.2237 17.3885 32.1376 17.5905 32.0323C17.5905 31.7674 17.5496 31.5817 17.4669 31.4764C17.3851 31.3699 17.2401 31.3178 17.0321 31.3178C16.767 31.3178 16.5676 31.3744 16.4355 31.4877C16.3315 31.5749 16.2479 31.7413 16.184 31.9848ZM17.5905 33.1171C17.3616 33.2254 17.1289 33.3191 16.8932 33.3979C16.5633 33.5145 16.3553 33.6289 16.2675 33.7422C16.2253 33.792 16.1914 33.853 16.1679 33.9212C16.1444 33.9895 16.1319 34.0634 16.1311 34.1384C16.1311 34.3083 16.1763 34.4476 16.2658 34.5551C16.3545 34.6627 16.4849 34.7159 16.6579 34.7159C16.8386 34.7159 17.0074 34.6582 17.1617 34.5416C17.3015 34.4462 17.4168 34.2981 17.4933 34.1158C17.5581 33.9471 17.5905 33.7297 17.5905 33.4613V33.1171ZM19.8699 34.229L21.4802 34.0275C21.5467 34.2823 21.6396 34.4634 21.759 34.5733C21.8783 34.6831 22.0377 34.7375 22.2372 34.7375C22.4554 34.7375 22.6242 34.6752 22.7435 34.5518C22.7864 34.5141 22.8215 34.463 22.8459 34.4029C22.8703 34.3429 22.8832 34.2757 22.8833 34.2075C22.8833 34.0524 22.822 33.9324 22.7001 33.8474C22.6123 33.7874 22.3795 33.7138 22.0019 33.6255C21.4393 33.4953 21.0472 33.3741 20.8289 33.2632C20.6074 33.1497 20.415 32.9539 20.2749 32.6993C20.1259 32.4391 20.0467 32.1203 20.0498 31.7934C20.0498 31.4232 20.1308 31.1038 20.2928 30.8355C20.4547 30.5671 20.6781 30.3678 20.9619 30.2353C21.2466 30.1029 21.6268 30.0361 22.1059 30.0361C22.6106 30.0361 22.9839 30.0881 23.2234 30.19C23.4638 30.292 23.665 30.4505 23.8253 30.6656C23.9864 30.8808 24.1194 31.1729 24.2259 31.5398L22.6881 31.7413C22.6587 31.5823 22.5881 31.442 22.4886 31.345C22.3507 31.2279 22.1894 31.1688 22.0258 31.1752C21.8425 31.1752 21.7095 31.2182 21.6251 31.3043C21.5868 31.3396 21.5554 31.3866 21.5336 31.4414C21.5118 31.4961 21.5002 31.5571 21.4998 31.6191C21.4998 31.7572 21.5535 31.8614 21.6592 31.9316C21.7658 32.0018 21.9968 32.0652 22.3531 32.1218C22.8919 32.2033 23.2934 32.3166 23.5568 32.4615C23.8193 32.6053 24.0205 32.8125 24.1603 33.0809C24.3001 33.3481 24.3692 33.6436 24.3692 33.9641C24.3692 34.289 24.2958 34.605 24.1475 34.9118C24.0009 35.2187 23.7682 35.4633 23.451 35.6456C23.1331 35.8268 22.7009 35.9173 22.1537 35.9173C21.3805 35.9173 20.8298 35.7713 20.5016 35.478C20.1756 35.1884 19.9489 34.7395 19.8708 34.229H19.8699ZM27.1038 28.0239V30.164H27.9963V31.7357H27.1038V33.732C27.1038 33.972 27.1208 34.1305 27.1549 34.2075C27.2086 34.3275 27.3015 34.3887 27.4345 34.3887C27.5539 34.3887 27.721 34.3423 27.9366 34.2505L28.056 35.7373C27.6553 35.8539 27.2802 35.9128 26.9324 35.9128C26.5284 35.9128 26.2309 35.8437 26.0391 35.7056C25.8474 35.5676 25.6975 35.346 25.6146 35.0783C25.5234 34.7986 25.4782 34.3434 25.4782 33.7161V31.7357H24.8798V30.164H25.4773V29.1313L27.1038 28.0239ZM33.4639 33.5089H30.2118C30.2408 33.8554 30.3115 34.1124 30.4232 34.2823C30.498 34.4008 30.5922 34.4952 30.6985 34.5584C30.8048 34.6216 30.9205 34.6518 31.037 34.6469C31.1964 34.6469 31.3472 34.5948 31.4913 34.4883C31.5791 34.4204 31.6729 34.3026 31.7743 34.1339L33.3718 34.3298C33.128 34.8948 32.8331 35.2991 32.4878 35.5448C32.1417 35.7894 31.6465 35.9128 31.0012 35.9128C30.4403 35.9128 29.9995 35.8075 29.6782 35.598C29.3568 35.3874 29.09 35.0545 28.8786 34.597C28.668 34.1396 28.5623 33.6029 28.5623 32.9846C28.5623 32.1059 28.7737 31.3948 29.1974 30.8513C29.6211 30.3078 30.2067 30.0361 30.9534 30.0361C31.5587 30.0361 32.0369 30.1584 32.3881 30.4018C32.7384 30.6452 33.0052 30.9985 33.1894 31.4605C33.3718 31.9225 33.4639 32.5249 33.4639 33.2654V33.5089ZM31.8144 32.4773C31.782 32.0607 31.6976 31.7617 31.5612 31.5828C31.4248 31.4016 31.2441 31.3122 31.0208 31.3122C30.9006 31.3079 30.7816 31.3428 30.674 31.4139C30.5664 31.485 30.4735 31.59 30.4036 31.7198C30.3047 31.8897 30.2416 32.141 30.216 32.4773H31.8144ZM34.2328 30.164H35.7518V31.0846C35.8967 30.686 36.0485 30.412 36.2036 30.2614C36.3588 30.1119 36.5514 30.0361 36.7799 30.0361C37.0186 30.0361 37.2802 30.1357 37.5641 30.3327L37.0629 31.8682C36.8711 31.7617 36.7202 31.7096 36.6085 31.7096C36.5103 31.705 36.4129 31.7348 36.3262 31.796C36.2394 31.8573 36.1662 31.9478 36.1141 32.0584C35.947 32.3868 35.8627 33.0005 35.8627 33.9007V35.786H34.2328V30.164ZM41.8332 32.6144L43.4153 33.2496C43.3087 33.8384 43.1417 34.3309 42.9124 34.7261C42.6848 35.1224 42.4009 35.4202 42.0625 35.6207C41.7232 35.8222 41.2919 35.923 40.7684 35.923C40.1342 35.923 39.6151 35.8007 39.2128 35.555C38.8104 35.3104 38.4626 34.879 38.1702 34.2607C37.8778 33.6436 37.7321 32.8533 37.7321 31.8897C37.7321 30.6045 37.9895 29.6171 38.5035 28.9275C39.0175 28.2368 39.7447 27.8926 40.6858 27.8926C41.4214 27.8926 41.9994 28.0896 42.4205 28.4859C42.8416 28.8811 43.1544 29.488 43.359 30.3067L41.765 30.7777C41.7276 30.5937 41.6686 30.4187 41.5902 30.2591C41.4938 30.0808 41.3666 29.9356 41.2194 29.8356C41.0673 29.7349 40.8992 29.6841 40.7292 29.6873C40.3201 29.6873 40.0064 29.9059 39.7881 30.3441C39.6236 30.6679 39.5409 31.1786 39.5409 31.8727C39.5409 32.7344 39.6398 33.3243 39.8359 33.6436C40.0328 33.9629 40.309 34.1237 40.6653 34.1237C41.0105 34.1237 41.2714 33.9947 41.4487 33.7365C41.6252 33.4794 41.753 33.1046 41.8323 32.6155L41.8332 32.6144ZM45.6589 31.9848L44.1083 31.7674C44.1671 31.4073 44.2515 31.1242 44.3615 30.9181C44.4723 30.7109 44.6309 30.5331 44.838 30.3803C44.9864 30.2716 45.1909 30.1866 45.4518 30.1266C45.7118 30.0666 45.9939 30.0361 46.2957 30.0361C46.7824 30.0361 47.1737 30.0723 47.4678 30.1448C47.7628 30.2172 48.0091 30.3678 48.2052 30.5977C48.3433 30.7562 48.4524 30.9816 48.5325 31.2726C48.6118 31.5636 48.6519 31.8421 48.6519 32.1059V34.5891C48.6519 34.8541 48.6647 35.0613 48.6894 35.2119C48.715 35.3613 48.7704 35.5516 48.8548 35.7848H47.3323C47.2852 35.6796 47.2452 35.5689 47.2129 35.4542C47.1879 35.3373 47.1694 35.2181 47.1575 35.0975C46.9444 35.3693 46.733 35.5629 46.5233 35.6795C46.2045 35.8426 45.8649 35.9218 45.5234 35.9128C45.0187 35.9128 44.6351 35.7577 44.3734 35.4463C44.2485 35.305 44.1485 35.1289 44.0807 34.9304C44.0129 34.7319 43.979 34.516 43.9813 34.2981C43.9813 33.8712 44.0751 33.5202 44.2635 33.245C44.4527 32.9688 44.8005 32.7649 45.3077 32.6302C45.7046 32.5302 46.0994 32.4165 46.4918 32.2894C46.6725 32.2237 46.8634 32.1376 47.0655 32.0323C47.0655 31.7674 47.0245 31.5817 46.9419 31.4764C46.86 31.3699 46.7151 31.3178 46.5071 31.3178C46.242 31.3178 46.0425 31.3744 45.9104 31.4877C45.8064 31.5749 45.7229 31.7413 45.6589 31.9848ZM47.0655 33.1171C46.8365 33.2254 46.6038 33.3191 46.3682 33.3979C46.0391 33.5145 45.8303 33.6289 45.7425 33.7422C45.7004 33.7921 45.6666 33.8531 45.6433 33.9214C45.62 33.9896 45.6076 34.0635 45.6069 34.1384C45.6069 34.3083 45.6513 34.4476 45.7408 34.5551C45.8294 34.6627 45.9607 34.7159 46.1329 34.7159C46.3136 34.7159 46.4824 34.6582 46.6375 34.5416C46.777 34.446 46.892 34.2979 46.9683 34.1158C47.0331 33.9471 47.0655 33.7297 47.0655 33.4613V33.1171ZM49.6484 30.164H51.1657V31.0846C51.3123 30.686 51.4641 30.412 51.6184 30.2614C51.7743 30.1119 51.9662 30.0361 52.1946 30.0361C52.4333 30.0361 52.695 30.1357 52.9797 30.3327L52.4768 31.8682C52.2867 31.7617 52.1349 31.7096 52.0233 31.7096C51.9251 31.705 51.8277 31.7348 51.7409 31.796C51.6541 31.8573 51.581 31.9478 51.5289 32.0584C51.3618 32.3868 51.2782 33.0005 51.2782 33.9007V35.786H49.6484V30.164ZM57.7065 28.0239V35.786H56.1875V34.9548C55.9752 35.307 55.7817 35.5459 55.6061 35.6682C55.3725 35.8313 55.1117 35.9128 54.8253 35.9128C54.2482 35.9128 53.8083 35.6218 53.504 35.0386C53.1996 34.4566 53.0471 33.7489 53.0471 32.9167C53.0471 31.9848 53.2158 31.2714 53.5517 30.7766C53.8876 30.284 54.3147 30.0361 54.8329 30.0361C55.0853 30.0361 55.3146 30.0927 55.52 30.2059C55.7263 30.3191 55.9087 30.489 56.0681 30.7143V28.0251L57.7065 28.0239ZM56.0801 32.9586C56.0801 32.517 56.0102 32.1886 55.8687 31.9712C55.8039 31.8671 55.7222 31.7839 55.6298 31.7276C55.5374 31.6714 55.4366 31.6435 55.335 31.6462C55.2432 31.6454 55.1525 31.6731 55.0702 31.7272C54.9879 31.7813 54.9163 31.8602 54.8611 31.9576C54.7332 32.1659 54.6693 32.5158 54.6693 33.0061C54.6693 33.4647 54.7349 33.801 54.867 34.0139C54.9238 34.1142 54.9975 34.1955 55.0822 34.2514C55.1668 34.3072 55.2601 34.336 55.3546 34.3355C55.4539 34.3374 55.5521 34.3092 55.6419 34.2531C55.7317 34.1969 55.8107 34.1144 55.8729 34.0116C56.011 33.7965 56.0801 33.4455 56.0801 32.9586Z" fill="black"/>
                </svg>
                {/* Amex */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.4 0.399902H4.40002C2.19089 0.399902 0.400024 2.19076 0.400024 4.3999V36.3999C0.400024 38.609 2.19089 40.3999 4.40002 40.3999H60.4C62.6092 40.3999 64.4 38.609 64.4 36.3999V4.3999C64.4 2.19076 62.6092 0.399902 60.4 0.399902Z" fill="white" stroke="black" strokeWidth="0.8"/>
                  <path d="M48.5438 35.7675H32.4757H16.2495V20.429V5.03271H32.2372H48.5438V20.5171V35.7675Z" fill="white"/>
                  <path d="M32.4582 16.166H30.0046L31.2314 13.3513L32.4582 16.166ZM34.0721 19.8147H36.8495L32.8599 11.213H29.6833L25.6937 19.8147H28.4053L29.1551 18.0934H33.3126L34.0745 19.8147H34.0721ZM46.1067 19.8147H48.5482V11.213H44.7533L42.7256 16.5714L40.7125 11.213H36.8519V19.8147H39.291V13.7937L41.6156 19.8147H43.7845L46.1091 13.7821V19.8147H46.1067ZM31.6209 27.675V26.336H36.7205V24.3946H31.6209V23.0556H36.8495V21.0656H29.1551V29.6673H36.8495V27.6773H31.6209V27.675ZM46.0653 25.3444L48.5482 27.858V22.8541L46.0653 25.3468V25.3444ZM45.3083 29.665H48.5482L44.2616 25.3398L48.5482 21.0633H45.3594L42.7134 23.8155L40.0918 21.0633H36.8495L41.1117 25.363L36.8495 29.665H39.9993L42.6599 26.8873L45.3058 29.665H45.3083ZM48.5482 35.767V30.8974H44.651L42.6453 28.787L40.6298 30.8974H27.7846V21.0587H23.6392L28.7826 9.98287H33.7435L35.5131 13.7775V9.98287H41.6521L42.7183 12.8416L43.7918 9.98287H48.5506V5.03223H16.2563V35.767H48.5506H48.5482Z" fill="#3C6CB1"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-gray-100 pt-8 md:flex-row">
          <p className="yt-small font-medium text-muted-foreground">© 2026 EdiCut Studios. All rights reserved.</p>
          <div className="flex gap-6 yt-tag font-black uppercase tracking-widest text-muted-foreground">
             <span>Made for YouTubers</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "verified" | "error">("idle");

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    setNewsletterStatus("idle");

    try {
      await executeInvisibleRecaptcha(form, "newsletter_signup");
      setNewsletterStatus("verified");
      form.reset();
    } catch {
      setNewsletterStatus("error");
    }
  }

  const sections = [
    {
      label: "Explore",
      links: [
      { label: "Who it's for", to: "/#creators" },
      { label: "Pricing", to: "/pricing" },
      { label: "Portfolio", to: "/portfolio" },
      { label: "FAQ", to: "/faq" },
      ],
    },
    {
      label: "Support",
      links: [
        { label: "Contact", to: "/contact" },
        { label: "FAQ", to: "/faq" },
        { label: "Privacy", to: "/privacy" },
        { label: "Terms", to: "/terms" },
      ],
    },
  ];

  return (
    <footer className="neo-footer relative overflow-hidden border-t px-4 sm:px-6">
      <div className="neo-footer__inner mx-auto max-w-7xl pb-5 pt-8 sm:pb-7 sm:pt-12 md:pb-10 md:pt-14">
        <div className="grid gap-4 md:grid-cols-[minmax(18rem,1.45fr)_minmax(9rem,1fr)_minmax(11rem,1fr)] md:items-stretch">
        <section className="neo-footer__lead flex flex-col justify-between p-5 md:p-6">
          <div>
            <p className="neo-footer__eyebrow inline-flex items-center gap-1.5 yt-tag font-black tracking-[0.14em] neo-footer-muted"><Film size={14} aria-hidden="true" />EdiCut / creator post-production</p>
            <h2 className="mt-3 type-card-title neo-footer-ink">Keep in touch</h2>
            <p className="mt-2 max-w-md text-sm leading-5 neo-footer-muted sm:text-[15px]">
              Editing support, creator tips, and useful updates for a steadier publishing rhythm.
            </p>
          </div>
          <form className="mt-6 flex max-w-[440px] flex-wrap items-center gap-2" onSubmit={handleNewsletterSubmit}>
            <input type="hidden" name="g-recaptcha-response" value="" />
            <label className="sr-only" htmlFor="footer-email">Your email address</label>
            <input
              id="footer-email"
              type="email"
              name="email"
              placeholder="Your email address"
              required
              autoComplete="email"
              className="neo-footer-input h-10 min-w-[180px] flex-1 rounded-full border px-4 text-sm font-medium outline-none"
            />
            <button type="submit" className="neo-button neo-button--dark neo-button--compact h-10 min-h-10 shrink-0 rounded-full py-0">
              Sign Up
            </button>
          </form>
          {newsletterStatus === "verified" ? <p className="mt-2 text-xs font-bold text-[#21825a]">Security check passed.</p> : null}
          {newsletterStatus === "error" ? <p className="mt-2 text-xs font-bold text-[#a91b27]">Security check failed. Please try again.</p> : null}
        </section>

          {sections.map((section) => {
            const isOpen = openSection === section.label;

            return (
              <section key={section.label} className="neo-footer__group">
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen ? null : section.label)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between text-left text-sm font-bold neo-footer-ink md:pointer-events-none md:border-b md:border-[var(--neo-line)] md:pb-3"
                >
                  {section.label}
                  <span className="footer-mobile-chevron material-symbols-outlined text-[20px] transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : undefined }}>
                    expand_more
                  </span>
                </button>
                <nav className={`grid gap-2 overflow-hidden text-sm transition-[max-height,opacity,padding] duration-200 ${isOpen ? "max-h-48 pb-4 pt-3 opacity-100" : "max-h-0 opacity-0"} md:mt-3 md:max-h-none md:overflow-visible md:pb-0 md:opacity-100`} aria-label={section.label}>
                  {section.links.map((item) => (
                    item.to.startsWith("/#") ? (
                      <a key={item.label} href={item.to} className="neo-footer-link transition-colors">{item.label}</a>
                    ) : (
                      <Link key={item.label} to={item.to} className="neo-footer-link transition-colors">{item.label}</Link>
                    )
                  ))}
                </nav>
              </section>
            );
          })}
        </div>

        <section className="neo-footer__bottom mt-5 md:mt-6">
          <div className="neo-footer__utility-rail">
            <div className="neo-footer__social">
              <div className="flex gap-3" aria-label="Social media icons">
                {[
                  "Facebook",
                  "Instagram",
                  "TikTok",
                  "YouTube",
                ].map((label) => (
                  <span key={label} role="img" aria-label={label} className="neo-footer-social-icon neo-footer-ink">
                    <HerlanSocialIcon name={label} />
                  </span>
                ))}
              </div>
            </div>

            <div className="neo-footer__copyright">
              <p className="text-xs font-medium neo-footer-muted">© 2026 EdiCut. All rights reserved.</p>
            </div>

            <div className="neo-footer__payments">
              <div>
                <p className="neo-footer__utility-label">Pay with</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["VISA", "MasterCard", "AMEX"].map((payment) => (
                  <span key={payment} className="neo-footer-payment">{payment}</span>
                ))}
              </div>
            </div>
          </div>

        </section>
      </div>

    </footer>
  );
}

function HerlanSocialIcon({ name }: { name: string }) {
  if (name === "Facebook") {
    return (
      <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M25 12.5C25 5.6 19.4 0 12.5 0C5.6 0 0 5.6 0 12.5C0 18.55 4.3 23.5875 10 24.75V16.25H7.5V12.5H10V9.375C10 6.9625 11.9625 5 14.375 5H17.5V8.75H15C14.3125 8.75 13.75 9.3125 13.75 10V12.5H17.5V16.25H13.75V24.9375C20.0625 24.3125 25 18.9875 25 12.5Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "Instagram") {
    return (
      <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M13.7857 0C15.192 0.00375 15.9057 0.01125 16.522 0.02875L16.7645 0.0375C17.0445 0.0475 17.3207 0.0599999 17.6545 0.0749999C18.9845 0.1375 19.892 0.3475 20.6882 0.65625C21.5132 0.97375 22.2082 1.40375 22.9032 2.0975C23.5388 2.72237 24.0307 3.47824 24.3445 4.3125C24.6532 5.10875 24.8632 6.01625 24.9257 7.3475C24.9407 7.68 24.9532 7.95625 24.9632 8.2375L24.9707 8.48C24.9895 9.095 24.997 9.80875 24.9995 11.215L25.0007 12.1475V13.785C25.0038 14.6968 24.9942 15.6085 24.972 16.52L24.9645 16.7625C24.9545 17.0437 24.942 17.32 24.927 17.6525C24.8645 18.9837 24.652 19.89 24.3445 20.6875C24.0316 21.5222 23.5396 22.2783 22.9032 22.9025C22.2782 23.5379 21.5224 24.0297 20.6882 24.3438C19.892 24.6525 18.9845 24.8625 17.6545 24.925C17.3579 24.939 17.0612 24.9515 16.7645 24.9625L16.522 24.97C15.9057 24.9875 15.192 24.9963 13.7857 24.9988L12.8532 25H11.217C10.3048 25.0031 9.39263 24.9936 8.48072 24.9712L8.23822 24.9638C7.94148 24.9525 7.64481 24.9396 7.34822 24.925C6.01822 24.8625 5.11072 24.6525 4.31322 24.3438C3.47906 24.0305 2.72349 23.5386 2.09947 22.9025C1.46328 22.2779 0.971002 21.5219 0.656971 20.6875C0.348221 19.8912 0.138221 18.9837 0.0757212 17.6525C0.0617947 17.3559 0.0492947 17.0592 0.0382212 16.7625L0.0319713 16.52C0.00893643 15.6085 -0.00148136 14.6968 0.00072125 13.785V11.215C-0.00276746 10.3033 0.00640019 9.3915 0.0282213 8.48L0.0369713 8.2375C0.0469713 7.95625 0.0594713 7.68 0.0744713 7.3475C0.136971 6.01625 0.346971 5.11 0.655721 4.3125C0.969614 3.47738 1.46287 2.72128 2.10072 2.0975C2.72459 1.46184 3.47965 0.969984 4.31322 0.65625C5.11072 0.3475 6.01697 0.1375 7.34822 0.0749999C7.68072 0.0599999 7.95822 0.0475 8.23822 0.0375L8.48072 0.0299999C9.39221 0.00779088 10.304 -0.00179337 11.2157 0.00124991L13.7857 0ZM12.5007 6.25C10.8431 6.25 9.25341 6.90848 8.0813 8.08058C6.9092 9.25268 6.25072 10.8424 6.25072 12.5C6.25072 14.1576 6.9092 15.7473 8.0813 16.9194C9.25341 18.0915 10.8431 18.75 12.5007 18.75C14.1583 18.0915 15.748 18.75 16.9201 16.9194C18.0922 15.7473 18.7507 14.1576 18.7507 12.5C18.7507 10.8424 18.0922 9.25268 16.9201 8.08058C15.748 6.90848 14.1583 6.25 12.5007 6.25ZM12.5007 8.75C12.9932 8.74992 13.4808 8.84683 13.9358 9.03521C14.3908 9.22359 14.8043 9.49975 15.1526 9.84791C15.5008 10.1961 15.7771 10.6094 15.9657 11.0644C16.1542 11.5193 16.2513 12.0069 16.2513 12.4994C16.2514 12.9918 16.1545 13.4795 15.9661 13.9345C15.7778 14.3895 15.5016 14.8029 15.1534 15.1512C14.8053 15.4995 14.3919 15.7758 13.937 15.9643C13.482 16.1528 12.9944 16.2499 12.502 16.25C11.5074 16.25 10.5536 15.8549 9.85032 15.1517C9.14706 14.4484 8.75197 13.4946 8.75197 12.5C8.75197 11.5054 9.14706 10.5516 9.85032 9.84835C10.5536 9.14509 11.5074 8.75 12.502 8.75M19.0645 4.375C18.6501 4.375 18.2526 4.53962 17.9596 4.83265C17.6666 5.12567 17.502 5.5231 17.502 5.9375C17.502 6.3519 17.6666 6.74933 17.9596 7.04235C18.2526 7.33538 18.6501 7.5 19.0645 7.5C19.4789 7.5 19.8763 7.33538 20.1693 7.04235C20.4624 6.74933 20.627 6.3519 20.627 5.9375C20.627 5.5231 20.4624 5.12567 20.1693 4.83265C19.8763 4.53962 19.4789 4.375 19.0645 4.375Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "TikTok") {
    return (
      <svg width="20" height="23" viewBox="0 0 20 23" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M15.55 3.525C14.6955 2.54953 14.2246 1.29679 14.225 0H10.3625V15.5C10.3327 16.3388 9.97859 17.1333 9.37471 17.7162C8.77083 18.2991 7.96431 18.6249 7.125 18.625C5.35 18.625 3.875 17.175 3.875 15.375C3.875 13.225 5.95 11.6125 8.0875 12.275V8.325C3.775 7.75 0 11.1 0 15.375C0 19.5375 3.45 22.5 7.1125 22.5C11.0375 22.5 14.225 19.3125 14.225 15.375V7.5125C15.7912 8.63731 17.6717 9.24081 19.6 9.2375V5.375C19.6 5.375 17.25 5.4875 15.55 3.525Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="25" height="18" viewBox="0 0 25 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M10 12.5L16.4875 8.75L10 5V12.5ZM24.45 2.7125C24.6125 3.3 24.725 4.0875 24.8 5.0875C24.8875 6.0875 24.925 6.95 24.925 7.7L25 8.75C25 11.4875 24.8 13.5 24.45 14.7875C24.1375 15.9125 23.4125 16.6375 22.2875 16.95C21.7 17.1125 20.625 17.225 18.975 17.3C17.35 17.3875 15.8625 17.425 14.4875 17.425L12.5 17.5C7.2625 17.5 4 17.3 2.7125 16.95C1.5875 16.6375 0.8625 15.9125 0.55 14.7875C0.3875 14.2 0.275 13.4125 0.2 12.4125C0.1125 11.4125 0.0749999 10.55 0.0749999 9.8L0 8.75C0 6.0125 0.2 4 0.55 2.7125C0.8625 1.5875 1.5875 0.8625 2.7125 0.55C3.3 0.3875 4.375 0.275 6.025 0.2C7.65 0.1125 9.1375 0.0749999 10.5125 0.0749999L12.5 0C17.7375 0 21 0.2 22.2875 0.55C23.4125 0.8625 24.1375 1.5875 24.45 2.7125Z" fill="currentColor" />
    </svg>
  );
}

export function MessageWidget() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <div
        aria-hidden={!isOpen}
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 ease-out ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <div
        aria-hidden={!isOpen}
        className={`neo-support-panel !fixed right-0 bottom-[calc(20%+2rem)] z-[70] w-[20rem] max-w-[calc(100vw-1.5rem)] mr-3 transition-all duration-300 ease-out md:bottom-[20%] ${isOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"}`}
      >
        <div className="pointer-events-none absolute inset-0 isolate rounded-3xl bg-neutral-900/50 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] ring-1 ring-white/15 backdrop-blur-lg backdrop-saturate-150" />
        <div className="relative overflow-hidden rounded-3xl text-white">
          <div className="relative px-5 pb-12 pt-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_60%)]" />
            <button
              type="button"
              aria-label="Close support"
              onClick={() => setIsOpen(false)}
              className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="relative flex items-center gap-3 pr-10">
              <p className="text-base font-medium leading-tight">EdiCut Support</p>
            </div>
          </div>

          <div className="space-y-2 p-4">
            <a
              href={CONTACT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-emerald-400/40"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30 transition group-hover:scale-105">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">WhatsApp</span>
                <span className="block truncate text-xs text-white/60">{CONTACT_WHATSAPP_DISPLAY_NUMBER}</span>
              </span>
              <span className="text-xs font-semibold text-emerald-300 opacity-0 transition group-hover:opacity-100">Open →</span>
            </a>
          </div>

          <div className="border-t border-white/5 px-4 py-2.5 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">EdiCut · Customer Care</div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Open support"
        aria-expanded={isOpen}
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
        onClick={() => setIsOpen(true)}
        className={`!fixed right-0 bottom-[calc(20%+2rem)] z-[65] neo-support-launcher group flex items-center gap-2 rounded-l-2xl py-4 pl-3 pr-2 transition-all duration-300 ease-out md:bottom-[20%] ${isOpen ? "pointer-events-none translate-x-2 opacity-0" : "pointer-events-auto translate-x-0 opacity-100"}`}
      >
        <span className="neo-support-launcher__icon flex h-9 w-9 items-center justify-center rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
          </svg>
        </span>
      </button>
    </>
  );
}

export function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen neo-home text-foreground ${className}`}>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <MessageWidget />
      <CookieConsent />
    </div>
  );
}

export function Eyebrow({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return <p className="yt-tag text-primary neo-section-label">{Icon ? <Icon size={16} strokeWidth={1.9} aria-hidden="true" /> : null}{children}</p>;
}

export function SectionIntro({ eyebrow, eyebrowIcon, title, copy }: { eyebrow?: string; eyebrowIcon?: LucideIcon; title: string; copy?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? <Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow> : null}
      <h2 className="yt-title mt-3 text-foreground">{title}</h2>
      {copy ? <p className="yt-subtitle mt-5">{copy}</p> : null}
    </div>
  );
}

export function ButtonLink({ to, children, variant = "primary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary" ? "neo-button--primary" : "neo-button--secondary";
  if (to.startsWith("/#") || to.startsWith("#")) {
    return <a href={to} className={`neo-button ${cls}`}>{children}</a>;
  }
  return <Link to={to} className={`neo-button ${cls}`}>{children}</Link>;
}

export function TrustStrip() {
  return (
    <section className="neo-trust-strip border-b neo-line px-5 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
        <p className="yt-tag neo-section-label"><BadgeCheck size={16} aria-hidden="true" />Trusted creative output, without the production drag</p>
        <div className="hidden flex-wrap items-center justify-center gap-x-8 gap-y-3 yt-small font-black tracking-[0.22em] neo-muted sm:flex">
          {["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"].map((logo) => <span key={logo}>{logo}</span>)}
        </div>
        <div className="neo-trust-strip-mobile-logos sm:hidden">
          <PortfolioScroller className="neo-trust-strip-scroller" ariaLabel="Client logos" mobileOnly>
            {["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"].map((logo) => (
              <span key={logo} className="neo-trust-logo yt-small font-black tracking-[0.22em] neo-muted">{logo}</span>
            ))}
          </PortfolioScroller>
        </div>
      </div>
    </section>
  );
}

export function WorkflowSection() {
  const outcomes = [
    "A clear monthly editing scope",
    "A ready-to-edit project brief",
    "A publish-ready final cut",
  ];

  return (
    <section id="workflow" className="border-b neo-line px-5 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="yt-tag neo-section-label"><Workflow size={16} aria-hidden="true" />How it works</p>
            <h2 className="mt-3 max-w-xl yt-title neo-ink">A clear path from raw footage to a finished upload.</h2>
            <p className="mt-5 max-w-xl yt-subtitle leading-8 neo-muted">
              Choose the right level of support, send us the project, and keep control through a focused review process.
            </p>
            <Link to="/pricing" className="neo-button neo-button--primary mt-7">
              Choose editing plan
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          <div className="relative grid gap-4 md:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-9 hidden h-px bg-primary/25 md:block" aria-hidden="true" />
            {workflow.map(([step, title, copy, icon], index) => (
              <article key={step} className="neo-card relative z-10 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="neo-icon-badge flex h-12 w-12 items-center justify-center rounded-2xl">
                    <span className="material-symbols-outlined text-[24px]">{icon}</span>
                  </span>
                  <span className="yt-tag font-black uppercase tracking-[0.16em] neo-muted">Step {Number(step)}</span>
                </div>
                <h3 className="mt-6 yt-title leading-tight neo-ink">{title}</h3>
                <p className="mt-3 yt-small font-medium leading-6 neo-muted">{copy}</p>
                <div className="mt-6 border-t neo-line pt-4">
                  <p className="yt-tag font-black uppercase tracking-[0.14em] neo-section-label"><BadgeCheck size={15} aria-hidden="true" />You get</p>
                  <p className="mt-2 yt-small font-black leading-5 neo-ink">{outcomes[index]}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PortfolioSection({ full = false, sections, className = "" }: { full?: boolean; sections?: PortfolioSectionView[]; className?: string }) {
  const portfolioSections = useMemo(() => {
    const source = sections?.length ? sections : defaultPortfolioSections;
    return source.filter((section) => section.slug && section.name);
  }, [sections]);
  const firstTabSlug = portfolioSections[0]?.slug || "featured";
  const [activeTab, setActiveTab] = useState(firstTabSlug);
  const [displayedTab, setDisplayedTab] = useState(firstTabSlug);
  const [isSwitching, setIsSwitching] = useState(false);
  const portfolioId = useId();
  const [playingItem, setPlayingItem] = useState<PortfolioVideo | null>(null);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [playerLoadFailed, setPlayerLoadFailed] = useState(false);
  const playerDialogRef = useRef<HTMLDialogElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabDragRef = useRef<{ pointerId: number; startX: number; lastX: number; moved: boolean } | null>(null);
  const skipDraggedTabClickUntilRef = useRef(0);
  const [isDraggingTabList, setIsDraggingTabList] = useState(false);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const activeSection = portfolioSections.find((section) => section.slug === displayedTab) || portfolioSections[0];
  const displayPortfolio = useMemo(() => buildPortfolioLayout(activeSection?.videos || []), [activeSection]);

  const startTabListDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    tabDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      moved: false,
    };
  };

  const moveTabListDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 6) return;

    if (!drag.moved) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDraggingTabList(true);
    }

    event.preventDefault();
    event.currentTarget.scrollLeft -= event.clientX - drag.lastX;
    drag.lastX = event.clientX;
  };

  const endTabListDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.moved) skipDraggedTabClickUntilRef.current = performance.now() + 350;
    tabDragRef.current = null;
    if (drag.moved) setIsDraggingTabList(false);

    if (event.type !== "lostpointercapture" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const suppressClickAfterTabDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.detail === 0 || performance.now() > skipDraggedTabClickUntilRef.current) return;
    if (!(event.target instanceof Element) || !event.target.closest("[role='tab']")) return;

    event.preventDefault();
    event.stopPropagation();
    skipDraggedTabClickUntilRef.current = 0;
  };

  useEffect(() => {
    if (!portfolioSections.some((section) => section.slug === activeTab)) {
      setActiveTab(firstTabSlug);
    }
  }, [activeTab, firstTabSlug, portfolioSections]);

  useEffect(() => {
    if (activeTab === displayedTab) {
      setIsSwitching(false);
      return;
    }

    setIsSwitching(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    const timeout = window.setTimeout(() => {
      setDisplayedTab(activeTab);
      setIsSwitching(false);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [activeTab, displayedTab]);

  useEffect(() => {
    const updateTabIndicator = () => {
      const tabList = tabListRef.current;
      const activeButton = tabRefs.current[activeTab];
      if (!tabList || !activeButton) return;

      const tabListRect = tabList.getBoundingClientRect();
      const activeButtonRect = activeButton.getBoundingClientRect();
      setTabIndicator({
        left: activeButtonRect.left - tabListRect.left + tabList.scrollLeft,
        top: activeButtonRect.top - tabListRect.top + tabList.scrollTop,
        width: activeButtonRect.width,
        height: activeButtonRect.height,
      });
    };

    updateTabIndicator();
    window.addEventListener("resize", updateTabIndicator);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateTabIndicator);
    if (resizeObserver && tabListRef.current) resizeObserver.observe(tabListRef.current);

    return () => {
      window.removeEventListener("resize", updateTabIndicator);
      resizeObserver?.disconnect();
    };
  }, [activeTab, portfolioSections]);

  useEffect(() => {
    setPlayingItem(null);
    setIsPlayerLoading(false);
    setPlayerLoadFailed(false);
  }, [activeTab]);

  useEffect(() => {
    if (!playingItem || !isPlayerLoading || playingItem.videoProvider === "cloudinary") return;

    // Some embedded videos never dispatch load when playback is blocked. Keep a
    // clear recovery path instead of leaving the user with an indefinite spinner.
    const timeout = window.setTimeout(() => {
      setIsPlayerLoading(false);
      setPlayerLoadFailed(true);
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [isPlayerLoading, playingItem]);

  const playPortfolioItem = (item: PortfolioVideo) => {
    setPlayerLoadFailed(false);
    setIsPlayerLoading(true);
    setPlayingItem(item);
  };

  const closePlayer = () => {
    setPlayingItem(null);
    setIsPlayerLoading(false);
    setPlayerLoadFailed(false);
  };

  useEffect(() => {
    if (!playingItem) return;
    const dialog = playerDialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [playingItem]);

  return (
    <section id="portfolio" className={`border-b neo-line px-5 py-14 sm:px-6 sm:py-20 ${className}`}>
      <div className="mx-auto max-w-7xl">
        {full ? (
          <div className="portfolio-gallery-intro">
            <div>
              <h2>Find your kind of edit.</h2>
              <p>Pick a format, then press play to explore the details.</p>
            </div>
            <span className="portfolio-gallery-note"><Film size={17} aria-hidden="true" /> Watch the full videos</span>
          </div>
        ) : <SectionIntro eyebrow="Selected work" eyebrowIcon={Film} title="Edits built to keep viewers watching." />}

        <div
          ref={tabListRef}
          className={`neo-inset neo-portfolio-tabs relative mx-auto mt-8 flex w-fit max-w-full flex-nowrap justify-center gap-1 p-1.5 ${isDraggingTabList ? "is-pointer-dragging" : ""}`}
          role="tablist"
          aria-label="Portfolio categories"
          onPointerDown={startTabListDrag}
          onPointerMove={moveTabListDrag}
          onPointerUp={endTabListDrag}
          onPointerCancel={endTabListDrag}
          onLostPointerCapture={endTabListDrag}
          onClickCapture={suppressClickAfterTabDrag}
          onDragStart={(event) => event.preventDefault()}
        >
          <span
            aria-hidden="true"
            className="neo-portfolio-tab-indicator"
            style={{
              width: `${tabIndicator.width}px`,
              height: `${tabIndicator.height}px`,
              opacity: tabIndicator.width ? 1 : 0,
              transform: `translate3d(${tabIndicator.left}px, ${tabIndicator.top}px, 0)`,
            }}
          />
          {portfolioSections.map((section, index) => (
            <button
              key={section.id}
              ref={(node) => {
                tabRefs.current[section.slug] = node;
              }}
              type="button"
              onClick={() => setActiveTab(section.slug)}
              onKeyDown={(event) => {
                let nextIndex = index;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % portfolioSections.length;
                else if (event.key === "ArrowLeft") nextIndex = (index - 1 + portfolioSections.length) % portfolioSections.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = portfolioSections.length - 1;
                else return;
                event.preventDefault();
                const nextSection = portfolioSections[nextIndex];
                setActiveTab(nextSection.slug);
                tabRefs.current[nextSection.slug]?.focus();
              }}
              id={`${portfolioId}-tab-${section.slug}`}
              role="tab"
              tabIndex={activeTab === section.slug ? 0 : -1}
              aria-selected={activeTab === section.slug}
              aria-controls={`${portfolioId}-panel`}
              className={`neo-portfolio-tab relative z-10 inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 py-2 yt-small font-black sm:px-4 ${
                activeTab === section.slug
                  ? "neo-portfolio-tab--active"
                  : "neo-portfolio-tab--inactive"
              }`}
            >
              {section.name}
            </button>
          ))}
        </div>

        <p className="neo-portfolio-swipe-hint mt-1 flex items-center justify-end gap-1 px-2 text-[0.6875rem] font-bold neo-muted sm:hidden">
          {full ? "Swipe for more formats" : "Drag or swipe for more"}
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
        </p>

        <div key={displayedTab} id={`${portfolioId}-panel`} className={`neo-portfolio-panel mt-8 ${isSwitching ? "is-switching" : ""}`} role="tabpanel" aria-labelledby={`${portfolioId}-tab-${activeSection?.slug || firstTabSlug}`} aria-busy={isSwitching} tabIndex={0} inert={isSwitching}>
          {displayPortfolio.length && full ? (
            <div className="portfolio-video-grid">
              {displayPortfolio.map((item) => (
                <article className={`portfolio-video ${item.orientation === "vertical" ? "portfolio-video-vertical" : ""}`} key={item.id}>
                  <PortfolioCard item={item} variant="wide" onPlay={playPortfolioItem} showCaption={false} />
                  <div className="portfolio-video-caption">
                    <p>{item.creatorName}</p>
                    <h3>{item.title}</h3>
                    <span>{item.uniqueSellingPoint === "YouTube sample" ? "YouTube sample" : item.tag || activeSection?.name}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : displayPortfolio.length ? (
            <PortfolioScroller ariaLabel={`${activeSection?.name || "Selected"} video reel`}>
              {displayPortfolio.map((item, index) => (
                <div key={item.id} style={{ animationDelay: `${Math.min(index, 3) * 55}ms` }} className={`neo-portfolio-slide neo-portfolio-slide--enter ${item.orientation === "horizontal" ? "neo-portfolio-slide--landscape" : ""} ${index === 0 ? "neo-portfolio-slide--featured" : ""}`}>
                  <PortfolioCard item={item} variant="slider" onPlay={playPortfolioItem} />
                </div>
              ))}
            </PortfolioScroller>
          ) : null}
          {displayPortfolio.length === 0 ? (
            <div className="neo-inset neo-portfolio-empty rounded-3xl border border-dashed border-slate-300 py-16 text-center yt-small font-bold neo-muted">
              No portfolio items found for {activeSection?.name || "this tab"}.
            </div>
          ) : null}
        </div>
        {!full ? <div className="neo-portfolio-view-all mt-6 hidden justify-center">
          <ButtonLink to="/portfolio">
            View more
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
          </ButtonLink>
        </div> : null}
      </div>

      {playingItem ? (
        <dialog
          ref={playerDialogRef}
          className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/85 px-4 py-16 backdrop-blur-sm"
          aria-label={`${playingItem.title} video player`}
          onCancel={closePlayer}
          onClick={closePlayer}
        >
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={closePlayer}
              className="absolute right-0 -top-12 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:bg-primary hover:text-white"
              aria-label="Close video player"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
            <div className={`relative overflow-hidden rounded-[28px] bg-black shadow-2xl ${playingItem.orientation === "vertical" ? "mx-auto aspect-[9/16] max-h-[calc(100dvh-8rem)] max-w-[460px]" : "mx-auto aspect-video max-h-[calc(100dvh-8rem)]"}`}>
              {playingItem.videoProvider === "cloudinary" ? (
                <video
                  className="h-full w-full object-contain"
                  src={playingItem.videoUrl}
                  poster={playingItem.thumbnailUrl || undefined}
                  title={`${playingItem.title} video`}
                  controls
                  autoPlay
                  playsInline
                  onCanPlay={() => setIsPlayerLoading(false)}
                  onError={() => {
                    setIsPlayerLoading(false);
                    setPlayerLoadFailed(true);
                  }}
                />
              ) : (
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${playingItem.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title={`${playingItem.title} video`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="eager"
                  onLoad={() => setIsPlayerLoading(false)}
                  onError={() => {
                    setIsPlayerLoading(false);
                    setPlayerLoadFailed(true);
                  }}
                />
              )}
              {isPlayerLoading ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center text-white" role="status" aria-live="polite">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                  <span className="text-sm font-semibold">Starting video…</span>
                </div>
              ) : null}
              {playerLoadFailed ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-5 text-center text-white" role="status">
                  <p className="font-semibold">This video is taking a while to load.</p>
                  {playingItem.videoProvider === "youtube" && playingItem.youtubeId ? (
                    <a className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-slate-200" href={`https://www.youtube.com/watch?v=${encodeURIComponent(playingItem.youtubeId)}`} target="_blank" rel="noreferrer">
                      Watch on YouTube
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

function PortfolioScroller({
  children,
  className = "",
  ariaLabel,
  mobileOnly = false,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  mobileOnly?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstSegmentRef = useRef<HTMLDivElement>(null);
  const autoFrameRef = useRef<number | null>(null);
  const momentumFrameRef = useRef<number | null>(null);
  const resumeAutoRef = useRef<number | null>(null);
  const autoRemainderRef = useRef(0);
  const autoPausedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const dragRef = useRef({
    didDrag: false,
    dragging: false,
    lastTime: 0,
    lastX: 0,
    pointerId: -1,
    velocity: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const getLoopWidth = () => firstSegmentRef.current?.offsetWidth || 0;

  const advanceScroll = (movement: number) => {
    const scroller = scrollerRef.current;
    const loopWidth = getLoopWidth();
    if (!scroller || loopWidth <= 0) return;

    scroller.scrollLeft = wrapLoopPosition(scroller.scrollLeft + movement, loopWidth);
  };

  const pauseAutoScroll = () => {
    autoPausedRef.current = true;
    if (resumeAutoRef.current !== null) {
      window.clearTimeout(resumeAutoRef.current);
      resumeAutoRef.current = null;
    }
  };

  const scheduleAutoScroll = () => {
    if (resumeAutoRef.current !== null) window.clearTimeout(resumeAutoRef.current);
    resumeAutoRef.current = window.setTimeout(() => {
      autoPausedRef.current = scrollerRef.current?.matches(":hover, :focus-within") || false;
      resumeAutoRef.current = null;
    }, 1200);
  };

  const resumeAutoScrollOnPointerLeave = () => {
    if (resumeAutoRef.current !== null) {
      window.clearTimeout(resumeAutoRef.current);
      resumeAutoRef.current = null;
    }
    autoPausedRef.current = scrollerRef.current?.matches(":focus-within") || false;
  };

  const stopMomentum = () => {
    if (momentumFrameRef.current !== null) {
      cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
  };

  const startMomentum = () => {
    const scroller = scrollerRef.current;
    if (!scroller || reducedMotionRef.current) return;

    let velocity = dragRef.current.velocity * 16;
    const step = () => {
      advanceScroll(velocity);
      velocity *= 0.94;

      if (Math.abs(velocity) < 0.15) {
        momentumFrameRef.current = null;
        return;
      }

      momentumFrameRef.current = requestAnimationFrame(step);
    };

    if (Math.abs(velocity) >= 0.15) momentumFrameRef.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const scroller = scrollerRef.current;
    if (!scroller) return;

    pauseAutoScroll();
    stopMomentum();
    dragRef.current = {
      didDrag: false,
      dragging: false,
      lastTime: performance.now(),
      lastX: event.clientX,
      pointerId: event.pointerId,
      velocity: 0,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const drag = dragRef.current;
    if (!scroller || drag.pointerId !== event.pointerId) return;

    if (!drag.dragging && Math.abs(event.clientX - drag.lastX) < 6) return;

    if (!drag.dragging) scroller.setPointerCapture(event.pointerId);
    drag.dragging = true;
    drag.didDrag = true;
    setIsDragging(true);
    event.preventDefault();

    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    const deltaX = event.clientX - drag.lastX;
    advanceScroll(-deltaX);
    drag.velocity = Math.max(-2.5, Math.min(2.5, -deltaX / elapsed));
    drag.lastX = event.clientX;
    drag.lastTime = now;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const drag = dragRef.current;
    if (!scroller || drag.pointerId !== event.pointerId) return;

    if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
    drag.pointerId = -1;
    setIsDragging(false);
    if (drag.didDrag && event.type !== "pointercancel") startMomentum();
    drag.dragging = false;
    scheduleAutoScroll();
  };

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileViewport = window.matchMedia("(max-width: 639px)");
    const scroller = scrollerRef.current;
    let lastFrameTime = 0;
    let isVisible = typeof IntersectionObserver === "undefined";
    const canAutoScroll = () =>
      isVisible &&
      !document.hidden &&
      !reducedMotionRef.current &&
      (!mobileOnly || mobileViewport.matches);

    const autoScroll = (time: number) => {
      const elapsed = lastFrameTime ? Math.min(time - lastFrameTime, 64) : 0;
      lastFrameTime = time;
      const scroller = scrollerRef.current;
      if (canAutoScroll() && !autoPausedRef.current && scroller) {
        const movement = elapsed * 0.027 + autoRemainderRef.current;
        const pixels = Math.floor(movement);
        autoRemainderRef.current = movement - pixels;
        if (pixels > 0) advanceScroll(pixels);
      }
      autoFrameRef.current = canAutoScroll() ? requestAnimationFrame(autoScroll) : null;
    };

    const syncAutoScroll = () => {
      if (!canAutoScroll()) {
        if (autoFrameRef.current !== null) cancelAnimationFrame(autoFrameRef.current);
        autoFrameRef.current = null;
        lastFrameTime = 0;
        stopMomentum();
        return;
      }

      if (autoFrameRef.current === null) {
        lastFrameTime = 0;
        autoFrameRef.current = requestAnimationFrame(autoScroll);
      }
    };

    const visibilityObserver = typeof IntersectionObserver === "undefined" || !scroller
      ? null
      : new IntersectionObserver((entries) => {
          const nextIsVisible = entries.some((entry) => entry.isIntersecting);
          if (nextIsVisible === isVisible) return;
          isVisible = nextIsVisible;
          syncAutoScroll();
        });
    if (visibilityObserver && scroller) visibilityObserver.observe(scroller);

    const updateMotionPreference = () => {
      reducedMotionRef.current = motionPreference.matches;
      syncAutoScroll();
    };
    const handleWheel = (event: WheelEvent) => {
      const movement = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (!movement || !scroller) return;
      event.preventDefault();
      pauseAutoScroll();
      stopMomentum();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
      advanceScroll(movement * unit);
      scheduleAutoScroll();
    };
    scroller?.addEventListener("wheel", handleWheel, { passive: false });
    const resizeObserver = new ResizeObserver(() => advanceScroll(0));
    if (firstSegmentRef.current) resizeObserver.observe(firstSegmentRef.current);
    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);
    document.addEventListener("visibilitychange", updateMotionPreference);
    if (mobileOnly) mobileViewport.addEventListener("change", updateMotionPreference);
    return () => {
      motionPreference.removeEventListener("change", updateMotionPreference);
      document.removeEventListener("visibilitychange", updateMotionPreference);
      if (mobileOnly) mobileViewport.removeEventListener("change", updateMotionPreference);
      scroller?.removeEventListener("wheel", handleWheel);
      visibilityObserver?.disconnect();
      resizeObserver.disconnect();
      if (autoFrameRef.current !== null) cancelAnimationFrame(autoFrameRef.current);
      if (resumeAutoRef.current !== null) window.clearTimeout(resumeAutoRef.current);
      stopMomentum();
    };
  }, []);

  return (
    <div
      ref={scrollerRef}
      role={ariaLabel ? "region" : undefined}
      className={`neo-portfolio-scroller ${className} ${isDragging ? "is-dragging" : ""}`}
      aria-label={ariaLabel}
      tabIndex={ariaLabel ? 0 : undefined}
      onPointerEnter={pauseAutoScroll}
      onPointerLeave={resumeAutoScrollOnPointerLeave}
      onFocusCapture={pauseAutoScroll}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleAutoScroll();
      }}
      onClickCapture={(event) => {
        if (!dragRef.current.didDrag) return;
        dragRef.current.didDrag = false;
        if (event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onScroll={() => {
        if ((scrollerRef.current?.scrollLeft || 0) >= getLoopWidth()) advanceScroll(0);
      }}
    >
      <div className="neo-portfolio-track">
        <div ref={firstSegmentRef} className="neo-portfolio-track-segment">{children}</div>
        <div className="neo-portfolio-track-segment" aria-hidden="true">
          <PortfolioCopyContext.Provider value={true}>{children}</PortfolioCopyContext.Provider>
        </div>
      </div>
    </div>
  );
}

function buildPortfolioLayout(videos: PortfolioVideo[]) {
  const orderedVideos = [...videos].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const selectedIds = new Set<string>();
  const take = (video: PortfolioVideo | undefined) => {
    if (!video || selectedIds.has(video.id)) return null;
    selectedIds.add(video.id);
    return video;
  };

  const hero = take(orderedVideos.find((video) => video.orientation === "horizontal") || orderedVideos[0]);
  const reel = take(orderedVideos.find((video) => video.orientation === "vertical") || orderedVideos.find((video) => !selectedIds.has(video.id)));
  const bottomVideos = orderedVideos
    .filter((video) => !selectedIds.has(video.id))
    .sort((a, b) => Number(b.orientation === "horizontal") - Number(a.orientation === "horizontal") || a.sortOrder - b.sortOrder);

  bottomVideos.forEach((video) => selectedIds.add(video.id));

  return [hero, reel, ...bottomVideos].filter((video): video is PortfolioVideo => Boolean(video));
}

function PortfolioCard({
  item,
  variant,
  featured = false,
  onPlay,
  showCaption = true,
}: {
  item: PortfolioVideo;
  variant: "hero" | "slider" | "wide" | "reel";
  featured?: boolean;
  onPlay: (item: PortfolioVideo) => void;
  showCaption?: boolean;
}) {
  const isCopy = useContext(PortfolioCopyContext);
  const sizeClass = {
    hero: "aspect-[4/3] sm:aspect-video lg:aspect-auto lg:h-[514px]",
    slider: "h-[240px] w-full sm:h-[320px] lg:h-[340px]",
    wide: "aspect-video",
    reel: featured ? "aspect-[9/14] lg:h-[514px] lg:aspect-auto" : "aspect-[9/14]",
  }[variant];

  return (
    <button
      type="button"
      tabIndex={isCopy ? -1 : undefined}
      onClick={() => onPlay(item)}
      className={`group relative block overflow-hidden rounded-[28px] border border-white bg-black text-left shadow-none ${sizeClass}`}
      aria-label={`Watch ${item.title} video`}
    >
      <img
        src={item.thumbnailUrl}
        alt={showCaption ? `${item.title} ${item.creatorName} video` : ""}
        loading="lazy"
        decoding="async"
        onError={(event) => {
          if (item.videoProvider !== "youtube" || !item.thumbnailUrl.endsWith("/maxresdefault.jpg")) return;
          const fallback = `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`;
          if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
        }}
        className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-md ring-1 ring-white/20" aria-hidden="true">
        <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" focusable="false">
          <rect x="3" y="6" width="13" height="12" rx="2.5" fill="currentColor" />
          <path d="m16 10 5-3v10l-5-3" fill="currentColor" />
        </svg>
      </span>

      {showCaption ? <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <p className="yt-tag font-black uppercase text-white/70">{item.creatorName}</p>
        <h3 className="type-card-title mt-1 text-white">{item.title}</h3>
      </div> : <span className="portfolio-video-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M8 5v14l11-7z" /></svg></span>}
    </button>
  );
}

export function PricingSection({ comparison = false, plans }: { comparison?: boolean; plans?: PricingPlanView[] }) {
  const planIcons = [Star, Award, Trophy];
  const editingPlans = sortByConfiguredPricingOrder(SUBSCRIPTION_PACKAGES.flatMap((plan, index) => {
    const configured = plans?.find((item) => item.slug === plan.slug);
    if (plans && !configured) return [];
    const configuredPrice = configured ? parsePackagePrice(configured.price) : null;
    return [{
      ...plan,
      name: configured?.name || plan.name,
      description: configured?.description || plan.description,
      features: configured?.features.length ? configured.features : plan.features,
      price: formatPackagePrice(configuredPrice ?? plan.basePrice),
      icon: planIcons[index],
      badge: configured?.badge || plan.badge,
      popular: configured?.popular ?? plan.slug === "creator-plus",
    }];
  }), plans);

  return (
    <section id="pricing" className="border-b neo-line px-5 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="neo-pricing-intro text-center">
          <p className="yt-tag neo-section-label"><CalendarDays size={16} aria-hidden="true" />Choose a monthly package</p>
          <h2 className="mx-auto mt-3 max-w-3xl yt-title neo-ink">
            <span className="hidden sm:inline">Monthly editing time for a steadier publishing rhythm.</span>
            <span className="sm:hidden">Monthly editing hours.</span>
          </h2>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {editingPlans.map((plan) => {
            const PlanIcon = plan.icon;
            return (
              <article key={plan.name} className={`neo-pricing-card neo-card group relative rounded-2xl p-5 ${plan.popular ? "ring-2 ring-primary/60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="neo-icon-badge flex h-10 w-10 items-center justify-center rounded-xl">
                    <PlanIcon aria-hidden="true" size={21} strokeWidth={1.8} />
                  </span>
                  <span className={`rounded-full px-2.5 py-1 yt-tag font-black uppercase ${plan.popular ? "bg-primary text-white" : "neo-inset neo-muted"}`}>
                    {plan.badge}
                  </span>
                </div>

                <h3 className="mt-5 type-card-title neo-ink">{plan.name}</h3>
                <p className="neo-pricing-description mt-3 min-h-20 yt-small font-medium leading-6 neo-muted">{plan.description}</p>

                <div className="neo-pricing-amount mt-5 border-y neo-line py-4">
                  <p className="yt-tag font-black uppercase tracking-[0.14em] neo-muted">Monthly package price</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="type-price neo-ink">{plan.price}</span>
                    <span className="yt-small font-bold neo-muted">/month</span>
                  </div>
                </div>

                <p className="mt-5 yt-tag font-black uppercase tracking-[0.14em] neo-muted"><BadgeCheck size={15} aria-hidden="true" />Every plan includes</p>
                <ul className="neo-pricing-features mt-3 grid gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 yt-small font-bold neo-ink">
                      <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link to={`/pricing/${plan.slug}`} className={`neo-button mt-6 w-full ${plan.popular ? "neo-button--primary" : "neo-button--dark"}`}>
                  Choose {plan.name}
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-sm font-medium leading-6 neo-muted">
          Each monthly price reserves the stated editing time across 22 working days. Editing and revisions use those hours; work beyond the monthly capacity is quoted separately. Card payments are currently unavailable.
        </p>

        {comparison ? <ComparisonTable plans={plans} /> : null}
      </div>
    </section>
  );
}

export function ComparisonTable({ plans }: { plans?: PricingPlanView[] } = {}) {
  const [featureMode, setFeatureMode] = useState<"key" | "all">("key");
  const comparisonPlans = sortByConfiguredPricingOrder(SUBSCRIPTION_PACKAGES.flatMap((plan) => {
    const configured = plans?.find((item) => item.slug === plan.slug);
    if (plans && !configured) return [];
    return [{
      ...plan,
      name: configured?.name || plan.name,
      description: configured?.description || plan.description,
      basePrice: parsePackagePrice(configured?.price || "") ?? plan.basePrice,
      features: configured?.features.length ? configured.features : plan.features,
    }];
  }), plans);
  const packages = comparisonPlans.map((plan) => [plan.name, formatPackagePrice(plan.basePrice), plan.description]);
  const keyRows = [
    ["Monthly price", ...comparisonPlans.map((plan) => formatPackagePrice(plan.basePrice))],
    ["Editing hours / month", ...comparisonPlans.map((plan) => String(plan.editingHoursPerMonth))],
    ["Editing hours / workday", ...comparisonPlans.map((plan) => String(plan.editingHoursPerWorkday))],
    ["Working days / month", ...comparisonPlans.map((plan) => String(plan.workingDaysPerMonth))],
    ["Editing and revisions", ...comparisonPlans.map(() => "Use reserved hours")],
    ["Unused hours", ...comparisonPlans.map(() => "Do not roll over")],
  ];
  const allRows = [
    ...keyRows,
    ["Captions", ...comparisonPlans.map(() => "Included")],
    ["Color and audio finishing", ...comparisonPlans.map((plan) => plan.slug === "creator" ? "Basic cleanup" : "Included")],
    ["Licensed stock / B-roll", ...comparisonPlans.map((plan) => plan.slug === "creator" ? "Quoted separately" : "Included asset library")],
    ["Template-based motion graphics", ...comparisonPlans.map((plan) => plan.slug === "creator-pro" ? "Light branded motion" : "-")],
    ["Custom VFX, project files, and AI voice-over", ...comparisonPlans.map(() => "Quoted separately")],
  ];
  const rows = featureMode === "key" ? keyRows : allRows;

  return (
    <section aria-labelledby="package-comparison-title" className="neo-surface mt-8 rounded-[2rem] p-4 sm:p-6 lg:p-8">
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
        <aside className="min-w-0">
          <h2 id="package-comparison-title" className="max-w-[230px] yt-title neo-ink">Compare packages</h2>
          <p className="mt-4 max-w-[280px] yt-small font-medium leading-6 text-slate-700">
            Compare reserved editing time, monthly planning basis, and finishing options across all three plans.
          </p>
          <div className="neo-inset mt-6 inline-flex max-w-full flex-wrap rounded-full p-1.5" role="group" aria-label="Package comparison detail level">
            <button
              type="button"
              onClick={() => setFeatureMode("key")}
              aria-pressed={featureMode === "key"}
              className={`min-h-11 rounded-full px-4 py-2.5 yt-tag font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${featureMode === "key" ? "neo-card neo-ink" : "neo-ink hover:text-primary"}`}
            >
              Key features
            </button>
            <button
              type="button"
              onClick={() => setFeatureMode("all")}
              aria-pressed={featureMode === "all"}
              className={`min-h-11 rounded-full px-4 py-2.5 yt-tag font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${featureMode === "all" ? "neo-card neo-ink" : "neo-ink hover:text-primary"}`}
            >
              All features
            </button>
          </div>
        </aside>

        <div className="self-start lg:col-start-2">
          <div className="grid gap-3 md:grid-cols-3">
            {packages.map(([name, price, copy]) => (
              <article key={name} className="neo-card flex h-full flex-col rounded-2xl p-4 sm:p-5">
                <h3 className="type-card-title neo-ink">{name}</h3>
                <p className="mt-3 type-price neo-ink">{price}<span className="yt-tag font-bold text-slate-700"> / month</span></p>
                <p className="mt-3 yt-small font-medium leading-6 text-slate-700">{copy}</p>
              </article>
            ))}
          </div>

          <div className="neo-inset mt-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="yt-subtitle font-black neo-ink">Need a custom editing solution bigger than these packages?</p>
            <Link to="/contact#contact" className="neo-button neo-button--secondary">
              Book call
            </Link>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <div
            role="region"
            aria-label="Scrollable package feature comparison"
            tabIndex={0}
            className="neo-inset overflow-x-auto rounded-2xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:p-3"
          >
            <div role="table" aria-label="Package features by plan" aria-colcount={4} aria-rowcount={rows.length + 1} className="min-w-[860px] overflow-hidden rounded-xl">
              <div role="rowgroup">
                <div role="row" className="grid grid-cols-[230px_repeat(3,minmax(150px,1fr))] border-b neo-line bg-white/40">
                  <div role="columnheader" className="px-4 py-3 yt-tag font-black uppercase tracking-[0.12em] text-slate-700">Package features</div>
                  {packages.map(([name]) => (
                    <div key={name} role="columnheader" className="border-l neo-line px-4 py-3 text-center yt-small font-black neo-ink">{name}</div>
                  ))}
                </div>
              </div>
              <div role="rowgroup">
                {rows.map(([label, creator, plus, pro]) => (
                  <div key={label} role="row" className="grid grid-cols-[230px_repeat(3,minmax(150px,1fr))] border-b neo-line last:border-b-0 hover:bg-white/25">
                    <div role="rowheader" className="flex min-h-[46px] items-center px-4 yt-small font-black neo-ink">{label}</div>
                    {[creator, plus, pro].map((value, index) => (
                      <div key={`${label}-${index}`} role="cell" className="flex min-h-[46px] items-center justify-center border-l neo-line px-4 text-center yt-small font-bold neo-ink">
                        <FeatureValue value={value} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureValue({ value }: { value: string }) {
  if (value === "Yes") {
    return <span className="material-symbols-outlined text-[19px] text-primary">check_circle</span>;
  }

  if (value === "No") {
    return <span className="text-muted-foreground">-</span>;
  }

  return <span>{value}</span>;
}

export function TestimonialsSection() {
  return (
    <section className="neo-testimonials border-b neo-line px-5 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <PortfolioScroller className="neo-testimonial-scroller">
          {testimonials.map(([quote, name, role]) => (
            <div key={name} className="neo-testimonial-slide">
              <article className="neo-card flex h-full min-h-[270px] flex-col items-center rounded-2xl p-7 text-center">
                <div className="flex items-center justify-center gap-1" aria-label="5 out of 5 stars">
                  {[1, 2, 3, 4, 5].map((star) => <span key={star} className="neo-rating-star material-symbols-outlined text-[17px]">star</span>)}
                </div>
                <p className="mt-5 w-full flex-1 yt-subtitle font-bold leading-8 neo-ink">"{quote}"</p>
                <div className="mt-6 w-full text-center">
                  <p className="font-black neo-ink">{name}</p>
                  <p className="mt-1 yt-small font-bold neo-muted">{role}</p>
                </div>
              </article>
            </div>
          ))}
        </PortfolioScroller>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="border-b neo-line px-5 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="FAQ" eyebrowIcon={CircleHelp} title="What creators usually ask before starting." />
        <div className="neo-surface mt-10 divide-y neo-line rounded-2xl p-2">
          {faqs.map(([q, a]) => (
            <details key={q} className="group rounded-xl p-5 transition hover:bg-transparent" open={q === faqs[0][0]}>
              <summary className="type-question flex cursor-pointer list-none items-center justify-between gap-4 neo-ink transition-colors group-hover:text-black">
                {q}
                <span className="neo-icon-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                  <span className="material-symbols-outlined neo-faq-arrow">expand_more</span>
                </span>
              </summary>
              <div className="neo-faq-answer">
                <div className="neo-faq-answer__content pt-4 leading-7 neo-muted">
                  {a}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection({ compact = false, page = false, status, action = "/?index#contact", contactEmail = DEFAULT_CONTACT_EMAIL }: { compact?: boolean; page?: boolean; status?: "sent" | "security-error" | "invalid-error" | "delivery-error"; action?: string; contactEmail?: string }) {
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const messageHelpId = useId();
  const navigation = useNavigation();
  const submit = useSubmit();

  useEffect(() => {
    if (navigation.state !== "idle") return;
    submittingRef.current = false;
    setSubmitting(false);
  }, [navigation.state]);

  useEffect(() => {
    function restoreForm(event: PageTransitionEvent) {
      if (!event.persisted) return;
      submittingRef.current = false;
      setSubmitting(false);
    }
    window.addEventListener("pageshow", restoreForm);
    return () => window.removeEventListener("pageshow", restoreForm);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;

    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSecurityError(null);

    try {
      await executeInvisibleRecaptcha(form, "contact_inquiry");
      await submit(form, { method: "post", action });
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section id="contact" className={`px-5 py-14 sm:px-6 sm:py-20 ${page ? "contact-main" : ""}`} aria-label="Contact inquiry">
      <div className="neo-contact-layout mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.75fr]">
        {!page ? <div className="neo-surface flex flex-col justify-center rounded-[2rem] p-7 sm:p-10">
          <p className="yt-tag neo-section-label"><MessageCircle size={16} aria-hidden="true" />Contact us</p>
          <p className="neo-contact-invitation hidden">Have a question? Send it below—we’re happy to help.</p>
          <h2 className="neo-contact-title mt-3 max-w-2xl yt-title neo-ink">
            Tell us what you are editing next.
          </h2>
          <p className="neo-contact-description mt-5 max-w-2xl yt-subtitle leading-8 neo-muted">
            We will review your channel and match you with the most efficient editing lane for your upload rhythm.
          </p>
          <div className="neo-contact-prompt neo-inset mt-8 flex items-center gap-3 rounded-2xl p-4">
            <p className="text-sm font-bold leading-6 neo-ink">Tell us your format, volume, and deadline. We will recommend the cleanest lane to start.</p>
          </div>
        </div> : null}
        <form method="post" action={action} className="neo-card contact-form grid gap-4 rounded-[2rem] p-5 sm:p-7" onSubmit={handleSubmit} aria-busy={submitting || navigation.state !== "idle"}>
          <input type="hidden" name="g-recaptcha-response" value="" />
          {page ? <div className="contact-form-heading"><h2>What are you working on?</h2><p>Tell us a little about your project. We&apos;ll take it from here.</p></div> : null}
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Input label={page ? "Your name" : "Name"} name="name" autoComplete="name" required compact={compact} minLength={2} maxLength={120} placeholder={page ? "Alex Morgan" : undefined} />
            <Input label={page ? "Email address" : "Email"} name="email" type="email" autoComplete="email" required compact={compact} maxLength={254} placeholder={page ? "you@example.com" : undefined} />
          </div>
          <label className={`grid gap-2 yt-small font-black ${compact ? "neo-contact-field--compact" : ""}`}>
            <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{page ? "Your project" : "Message"}</span>
            <textarea name="brief" required minLength={20} maxLength={1200} aria-describedby={page ? messageHelpId : undefined} autoComplete="off" placeholder={compact ? "Message" : page ? "Share your channel, editing style, and deadline. Links to examples are welcome." : undefined} className="neo-inset min-h-28 rounded-xl px-4 py-3 font-medium outline-none focus:border-foreground" />
            {page ? <span id={messageHelpId} className="contact-field-help">20–1,200 characters. Include your editing needs and timeline.</span> : null}
          </label>
          <button type="submit" disabled={submitting || navigation.state !== "idle"} className="neo-button neo-button--primary w-full">{submitting || navigation.state !== "idle" ? "Sending inquiry…" : "Send inquiry"}{page ? <span className="material-symbols-outlined text-[19px]" aria-hidden="true">arrow_forward</span> : null}</button>
          {status === "sent" ? <p role="status" className="neo-inset rounded-xl px-4 py-3 yt-small font-black text-primary">Message sent. We will reply shortly.</p> : null}
          {securityError || status === "security-error" ? <p role="alert" className="rounded-xl bg-[#f6dfe2] px-4 py-3 yt-small font-black text-[#a91b27]">{securityError || "Security check failed. Please try again."}</p> : null}
          {status === "invalid-error" ? <p role="alert" className="rounded-xl bg-[#f6dfe2] px-4 py-3 yt-small font-black text-[#a91b27]">Enter a name, valid email, and a message of 20–1,200 characters, then try again.</p> : null}
          {status === "delivery-error" ? <p role="alert" className="rounded-xl bg-[#f6dfe2] px-4 py-3 yt-small font-black text-[#a91b27]">We couldn&apos;t save your inquiry. Please try again or email <a className="underline underline-offset-2" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p> : null}
          <p className="neo-contact-response yt-small font-bold neo-muted">{page ? "Replies within 24 hours. No commitment to get in touch." : `${contactEmail} · Replies within 24 hours`}</p>
        </form>
        {page ? <ContactPageIntro contactEmail={contactEmail} /> : null}
      </div>
    </section>
  );
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  autoComplete,
  compact = false,
  placeholder,
  minLength,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  compact?: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <label className={`neo-contact-field grid gap-2 yt-small font-black ${compact ? "neo-contact-field--compact" : ""}`}>
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
      <input name={name} type={type} required={required} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} placeholder={compact ? label : placeholder} className="neo-inset h-12 min-w-0 w-full rounded-xl px-4 yt-body font-medium outline-none focus:border-foreground" />
    </label>
  );
}

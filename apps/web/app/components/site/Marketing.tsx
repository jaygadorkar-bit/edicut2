import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useMatches } from "react-router";
import { authHref } from "../auth/AuthModal";
import { executeInvisibleRecaptcha } from "../../lib/recaptcha.client";
import { faqs, legalLinks, navLinks, plans as defaultPlans, portfolio, testimonials, workflow } from "./data";
import type { PortfolioSection as PortfolioSectionView, PortfolioVideo } from "../../lib/portfolio.server";

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

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-red-500/20 transition-transform hover:scale-105 active:scale-95">
        <span className="material-symbols-outlined text-[24px]">play_arrow</span>
      </span>
      <span className="text-xl font-black uppercase tracking-tight text-foreground">EdiCut</span>
    </span>
  );
}

export function SiteHeader() {
  const matches = useMatches();
  const location = useLocation();
  const rootData = matches.find((m) => m.id === "root")?.data as { promoBarSettings?: { enabled: boolean; message: string } } | undefined;
  const isSignedIn = matches.some((match) => Boolean((match.data as { isSignedIn?: boolean } | undefined)?.isSignedIn));

  const promoEnabled = rootData?.promoBarSettings?.enabled;
  const promoMessage = rootData?.promoBarSettings?.message;

  return (
    <>
      {promoEnabled && promoMessage ? (
        <div className="flex h-10 w-full items-center justify-center bg-[#F7F8F9] px-4 text-center text-[11px] font-black uppercase tracking-widest text-foreground">
          {promoMessage}
        </div>
      ) : null}
      
      <header className="glass-nav sticky top-0 z-50 w-full border-b border-black/5 transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="EdiCut home" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/60 p-1.5 backdrop-blur-md md:flex">
            {navLinks.map((item) => (
              <NavLink
                key={item.label}
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
          </nav>

          <Link
            to={isSignedIn ? "/dashboard" : authHref(location.pathname, location.search, "signup")}
            className="group hidden items-center gap-2 rounded-full bg-primary px-7 py-3 text-[11px] font-black uppercase tracking-wider text-white shadow-xl shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 md:inline-flex"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white transition-colors">
              <span className="material-symbols-outlined text-[12px]">
                {isSignedIn ? "space_dashboard" : "person"}
              </span>
            </span>
            {isSignedIn ? "Go to Dashboard" : "Get Started"}
          </Link>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "verified" | "error">("idle");

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsletterStatus("idle");

    try {
      await executeInvisibleRecaptcha(event.currentTarget, "newsletter_signup");
      setNewsletterStatus("verified");
      event.currentTarget.reset();
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
            <Link to="/"><Logo /></Link>
            <p className="text-sm leading-7 text-muted-foreground max-w-sm">
              The high-retention editing partner for modern YouTubers. Scale your channel without living in the timeline.
            </p>
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Join the waitlist</h4>
              <form className="flex gap-2" onSubmit={handleNewsletterSubmit}>
                <input type="hidden" name="g-recaptcha-response" value="" />
                <input 
                  type="email" 
                  name="email"
                  placeholder="Email address" 
                  required
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium outline-none focus:border-primary"
                />
                <button type="submit" className="flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90">
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </form>
              {newsletterStatus === "verified" ? <p className="text-xs font-black text-primary">Security check passed.</p> : null}
              {newsletterStatus === "error" ? <p className="text-xs font-black text-[#D90000]">Security check failed. Please try again.</p> : null}
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Services</h4>
            <nav className="flex flex-col gap-4 text-sm font-bold text-muted-foreground">
              {navLinks.map((item) => (
                <Link key={item.label} to={item.to} className="hover:text-primary transition-colors">{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Company</h4>
            <nav className="flex flex-col gap-4 text-sm font-bold text-muted-foreground">
              {legalLinks.map((item) => (
                <Link key={item.label} to={item.to} className="hover:text-primary transition-colors">{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* Contact & Payments */}
          <div className="space-y-8 lg:text-right">
            <div className="space-y-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Get in touch</h4>
              <div className="flex flex-col gap-4 lg:items-end">
                <a href="mailto:hello@edicut.com" className="flex items-center gap-3 text-sm font-bold text-muted-foreground hover:text-primary transition-colors lg:flex-row-reverse">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-primary">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                  </span>
                  hello@edicut.com
                </a>
                <a href="https://wa.me/yournumber" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-bold text-muted-foreground hover:text-primary transition-colors lg:flex-row-reverse">
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
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Supported Payments</h4>
              <div className="flex gap-3 lg:justify-end">
                {/* Visa */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.7561 0.399902H4.04365C2.03126 0.399902 0.399902 1.98297 0.399902 3.93579V36.864C0.399902 38.8168 2.03126 40.3999 4.04365 40.3999H60.7561C62.7685 40.3999 64.3999 38.8168 64.3999 36.864V3.93579C64.3999 1.98297 62.7685 0.399902 60.7561 0.399902Z" fill="white" stroke="black" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M27.7653 12.8453L25.3051 27.9653H29.2413L31.7019 12.8453H27.7653ZM21.9932 12.8453L18.2403 23.2447L17.7963 21.0054L17.7967 21.0061L17.6988 20.5042C17.2446 19.5253 16.1927 17.6649 14.2063 16.0772C13.6505 15.6341 13.0653 15.2292 12.4548 14.8652L15.8657 27.9653H19.9669L26.2298 12.8453H21.9932ZM37.3557 17.0429C37.3557 15.3335 41.1893 15.5531 42.8738 16.4814L43.4355 13.234C43.4355 13.234 41.7019 12.5747 39.8949 12.5747C37.9414 12.5747 33.3026 13.429 33.3026 17.5801C33.3026 21.4867 38.7472 21.5353 38.7472 23.5863C38.7472 25.6374 33.8639 25.2708 32.2524 23.977L31.6667 27.3712C31.6667 27.3712 33.4243 28.2255 36.1104 28.2255C38.7962 28.2255 42.8493 26.8341 42.8493 23.0492C42.8493 19.1181 37.3557 18.752 37.3557 17.0429ZM53.4185 12.8453H50.2537C48.7923 12.8453 48.4364 13.9721 48.4364 13.9721L42.5662 27.9653H46.669L47.4897 25.7196H52.4939L52.9556 27.9653H56.5699L53.4185 12.8453ZM48.6241 22.6168L50.6925 16.9585L51.8562 22.6168H48.6241Z" fill="#005BAC"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M16.5257 14.2689C16.5257 14.2689 16.3627 12.9043 14.6233 12.9043H8.30376L8.22974 13.1608C8.22974 13.1608 11.2674 13.78 14.1817 16.1C16.9667 18.3173 17.8752 21.0813 17.8752 21.0813L16.5257 14.2689Z" fill="#F6AC1D"/>
                </svg>
                {/* Mastercard */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.7562 0.399902H4.04365C2.03126 0.399902 0.399902 1.98297 0.399902 3.93579V36.864C0.399902 38.8168 2.03126 40.3999 4.04365 40.3999H60.7562C62.7685 40.3999 64.3999 38.8168 64.3999 36.864V3.93579C64.3999 1.98297 62.7685 0.399902 60.7562 0.399902Z" fill="white" stroke="black" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M34.8885 15.2685C34.8885 21.0061 30.2365 25.659 24.498 25.659C18.7584 25.659 14.1064 21.007 14.1064 15.2685C14.1064 9.52891 18.7584 4.87695 24.498 4.87695C30.2355 4.87695 34.8885 9.52891 34.8885 15.2685Z" fill="#F72000"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M49.769 15.2685C49.769 21.0061 45.117 25.659 39.3785 25.659C33.6389 25.659 28.9869 21.007 28.9869 15.2685C28.9869 9.52891 33.6389 4.87695 39.3785 4.87695C45.1161 4.87695 49.769 9.52891 49.769 15.2685Z" fill="#FFBB00"/>
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M34.8885 15.2685C34.8885 21.0061 30.2365 25.659 24.498 25.659C18.7584 25.659 14.1064 21.007 14.1064 15.2685C14.1064 9.52891 18.7584 4.87695 24.498 4.87695C30.2355 4.87695 34.8885 9.52891 34.8885 15.2685Z" fill="#F72000" fill-opacity="0.378"/>
                  <path d="M7.09351 28.0251H9.46842L10.3848 32.7468L11.2978 28.0251H13.665V35.786H12.1903V29.8673L11.0471 35.786H9.71137L8.57165 29.8673V35.786H7.09351V28.0251ZM16.184 31.9848L14.6334 31.7674C14.6922 31.4073 14.7766 31.1242 14.8865 30.9181C14.9974 30.7109 15.1559 30.5331 15.3631 30.3803C15.5114 30.2716 15.716 30.1866 15.9768 30.1266C16.2368 30.0666 16.5181 30.0361 16.8208 30.0361C17.3075 30.0361 17.6988 30.0723 17.9929 30.1448C18.2878 30.2172 18.5333 30.3678 18.7302 30.5977C18.8683 30.7562 18.9774 30.9816 19.0567 31.2726C19.1368 31.5636 19.1761 31.8421 19.1761 32.1059V34.5891C19.1761 34.8541 19.1897 35.0613 19.2144 35.2119C19.24 35.3613 19.2945 35.5516 19.3798 35.7848H17.8573C17.8102 35.6796 17.7703 35.5689 17.738 35.4542C17.7129 35.3373 17.6944 35.2181 17.6826 35.0975C17.4695 35.3693 17.2581 35.5629 17.0484 35.6795C16.7296 35.8426 16.39 35.9218 16.0484 35.9128C15.5438 35.9128 15.1602 35.7577 14.8985 35.4463C14.7735 35.305 14.6736 35.1289 14.6058 34.9304C14.538 34.7319 14.5041 34.516 14.5064 34.2981C14.5064 33.8712 14.6001 33.5202 14.7885 33.245C14.9778 32.9688 15.3256 32.7649 15.8328 32.6302C16.2296 32.5302 16.6244 32.4165 17.0168 32.2894C17.1975 32.2237 17.3885 32.1376 17.5905 32.0323C17.5905 31.7674 17.5496 31.5817 17.4669 31.4764C17.3851 31.3699 17.2401 31.3178 17.0321 31.3178C16.767 31.3178 16.5676 31.3744 16.4355 31.4877C16.3315 31.5749 16.2479 31.7413 16.184 31.9848ZM17.5905 33.1171C17.3616 33.2254 17.1289 33.3191 16.8932 33.3979C16.5633 33.5145 16.3553 33.6289 16.2675 33.7422C16.2253 33.792 16.1914 33.853 16.1679 33.9212C16.1444 33.9895 16.1319 34.0634 16.1311 34.1384C16.1311 34.3083 16.1763 34.4476 16.2658 34.5551C16.3545 34.6627 16.4849 34.7159 16.6579 34.7159C16.8386 34.7159 17.0074 34.6582 17.1617 34.5416C17.3015 34.4462 17.4168 34.2981 17.4933 34.1158C17.5581 33.9471 17.5905 33.7297 17.5905 33.4613V33.1171ZM19.8699 34.229L21.4802 34.0275C21.5467 34.2823 21.6396 34.4634 21.759 34.5733C21.8783 34.6831 22.0377 34.7375 22.2372 34.7375C22.4554 34.7375 22.6242 34.6752 22.7435 34.5518C22.7864 34.5141 22.8215 34.463 22.8459 34.4029C22.8703 34.3429 22.8832 34.2757 22.8833 34.2075C22.8833 34.0524 22.822 33.9324 22.7001 33.8474C22.6123 33.7874 22.3795 33.7138 22.0019 33.6255C21.4393 33.4953 21.0472 33.3741 20.8289 33.2632C20.6074 33.1497 20.415 32.9539 20.2749 32.6993C20.1259 32.4391 20.0467 32.1203 20.0498 31.7934C20.0498 31.4232 20.1308 31.1038 20.2928 30.8355C20.4547 30.5671 20.6781 30.3678 20.9619 30.2353C21.2466 30.1029 21.6268 30.0361 22.1059 30.0361C22.6106 30.0361 22.9839 30.0881 23.2234 30.19C23.4638 30.292 23.665 30.4505 23.8253 30.6656C23.9864 30.8808 24.1194 31.1729 24.2259 31.5398L22.6881 31.7413C22.6587 31.5823 22.5881 31.442 22.4886 31.345C22.3507 31.2279 22.1894 31.1688 22.0258 31.1752C21.8425 31.1752 21.7095 31.2182 21.6251 31.3043C21.5868 31.3396 21.5554 31.3866 21.5336 31.4414C21.5118 31.4961 21.5002 31.5571 21.4998 31.6191C21.4998 31.7572 21.5535 31.8614 21.6592 31.9316C21.7658 32.0018 21.9968 32.0652 22.3531 32.1218C22.8919 32.2033 23.2934 32.3166 23.5568 32.4615C23.8193 32.6053 24.0205 32.8125 24.1603 33.0809C24.3001 33.3481 24.3692 33.6436 24.3692 33.9641C24.3692 34.289 24.2958 34.605 24.1475 34.9118C24.0009 35.2187 23.7682 35.4633 23.451 35.6456C23.1331 35.8268 22.7009 35.9173 22.1537 35.9173C21.3805 35.9173 20.8298 35.7713 20.5016 35.478C20.1756 35.1884 19.9489 34.7395 19.8708 34.229H19.8699ZM27.1038 28.0239V30.164H27.9963V31.7357H27.1038V33.732C27.1038 33.972 27.1208 34.1305 27.1549 34.2075C27.2086 34.3275 27.3015 34.3887 27.4345 34.3887C27.5539 34.3887 27.721 34.3423 27.9366 34.2505L28.056 35.7373C27.6553 35.8539 27.2802 35.9128 26.9324 35.9128C26.5284 35.9128 26.2309 35.8437 26.0391 35.7056C25.8474 35.5676 25.6975 35.346 25.6146 35.0783C25.5234 34.7986 25.4782 34.3434 25.4782 33.7161V31.7357H24.8798V30.164H25.4773V29.1313L27.1038 28.0239ZM33.4639 33.5089H30.2118C30.2408 33.8554 30.3115 34.1124 30.4232 34.2823C30.498 34.4008 30.5922 34.4952 30.6985 34.5584C30.8048 34.6216 30.9205 34.6518 31.037 34.6469C31.1964 34.6469 31.3472 34.5948 31.4913 34.4883C31.5791 34.4204 31.6729 34.3026 31.7743 34.1339L33.3718 34.3298C33.128 34.8948 32.8331 35.2991 32.4878 35.5448C32.1417 35.7894 31.6465 35.9128 31.0012 35.9128C30.4403 35.9128 29.9995 35.8075 29.6782 35.598C29.3568 35.3874 29.09 35.0545 28.8786 34.597C28.668 34.1396 28.5623 33.6029 28.5623 32.9846C28.5623 32.1059 28.7737 31.3948 29.1974 30.8513C29.6211 30.3078 30.2067 30.0361 30.9534 30.0361C31.5587 30.0361 32.0369 30.1584 32.3881 30.4018C32.7384 30.6452 33.0052 30.9985 33.1894 31.4605C33.3718 31.9225 33.4639 32.5249 33.4639 33.2654V33.5089ZM31.8144 32.4773C31.782 32.0607 31.6976 31.7617 31.5612 31.5828C31.4248 31.4016 31.2441 31.3122 31.0208 31.3122C30.9006 31.3079 30.7816 31.3428 30.674 31.4139C30.5664 31.485 30.4735 31.59 30.4036 31.7198C30.3047 31.8897 30.2416 32.141 30.216 32.4773H31.8144ZM34.2328 30.164H35.7518V31.0846C35.8967 30.686 36.0485 30.412 36.2036 30.2614C36.3588 30.1119 36.5514 30.0361 36.7799 30.0361C37.0186 30.0361 37.2802 30.1357 37.5641 30.3327L37.0629 31.8682C36.8711 31.7617 36.7202 31.7096 36.6085 31.7096C36.5103 31.705 36.4129 31.7348 36.3262 31.796C36.2394 31.8573 36.1662 31.9478 36.1141 32.0584C35.947 32.3868 35.8627 33.0005 35.8627 33.9007V35.786H34.2328V30.164ZM41.8332 32.6144L43.4153 33.2496C43.3087 33.8384 43.1417 34.3309 42.9124 34.7261C42.6848 35.1224 42.4009 35.4202 42.0625 35.6207C41.7232 35.8222 41.2919 35.923 40.7684 35.923C40.1342 35.923 39.6151 35.8007 39.2128 35.555C38.8104 35.3104 38.4626 34.879 38.1702 34.2607C37.8778 33.6436 37.7321 32.8533 37.7321 31.8897C37.7321 30.6045 37.9895 29.6171 38.5035 28.9275C39.0175 28.2368 39.7447 27.8926 40.6858 27.8926C41.4214 27.8926 41.9994 28.0896 42.4205 28.4859C42.8416 28.8811 43.1544 29.488 43.359 30.3067L41.765 30.7777C41.7276 30.5937 41.6686 30.4187 41.5902 30.2591C41.4938 30.0808 41.3666 29.9356 41.2194 29.8356C41.0673 29.7349 40.8992 29.6841 40.7292 29.6873C40.3201 29.6873 40.0064 29.9059 39.7881 30.3441C39.6236 30.6679 39.5409 31.1786 39.5409 31.8727C39.5409 32.7344 39.6398 33.3243 39.8359 33.6436C40.0328 33.9629 40.309 34.1237 40.6653 34.1237C41.0105 34.1237 41.2714 33.9947 41.4487 33.7365C41.6252 33.4794 41.753 33.1046 41.8323 32.6155L41.8332 32.6144ZM45.6589 31.9848L44.1083 31.7674C44.1671 31.4073 44.2515 31.1242 44.3615 30.9181C44.4723 30.7109 44.6309 30.5331 44.838 30.3803C44.9864 30.2716 45.1909 30.1866 45.4518 30.1266C45.7118 30.0666 45.9939 30.0361 46.2957 30.0361C46.7824 30.0361 47.1737 30.0723 47.4678 30.1448C47.7628 30.2172 48.0091 30.3678 48.2052 30.5977C48.3433 30.7562 48.4524 30.9816 48.5325 31.2726C48.6118 31.5636 48.6519 31.8421 48.6519 32.1059V34.5891C48.6519 34.8541 48.6647 35.0613 48.6894 35.2119C48.715 35.3613 48.7704 35.5516 48.8548 35.7848H47.3323C47.2852 35.6796 47.2452 35.5689 47.2129 35.4542C47.1879 35.3373 47.1694 35.2181 47.1575 35.0975C46.9444 35.3693 46.733 35.5629 46.5233 35.6795C46.2045 35.8426 45.8649 35.9218 45.5234 35.9128C45.0187 35.9128 44.6351 35.7577 44.3734 35.4463C44.2485 35.305 44.1485 35.1289 44.0807 34.9304C44.0129 34.7319 43.979 34.516 43.9813 34.2981C43.9813 33.8712 44.0751 33.5202 44.2635 33.245C44.4527 32.9688 44.8005 32.7649 45.3077 32.6302C45.7046 32.5302 46.0994 32.4165 46.4918 32.2894C46.6725 32.2237 46.8634 32.1376 47.0655 32.0323C47.0655 31.7674 47.0245 31.5817 46.9419 31.4764C46.86 31.3699 46.7151 31.3178 46.5071 31.3178C46.242 31.3178 46.0425 31.3744 45.9104 31.4877C45.8064 31.5749 45.7229 31.7413 45.6589 31.9848ZM47.0655 33.1171C46.8365 33.2254 46.6038 33.3191 46.3682 33.3979C46.0391 33.5145 45.8303 33.6289 45.7425 33.7422C45.7004 33.7921 45.6666 33.8531 45.6433 33.9214C45.62 33.9896 45.6076 34.0635 45.6069 34.1384C45.6069 34.3083 45.6513 34.4476 45.7408 34.5551C45.8294 34.6627 45.9607 34.7159 46.1329 34.7159C46.3136 34.7159 46.4824 34.6582 46.6375 34.5416C46.777 34.446 46.892 34.2979 46.9683 34.1158C47.0331 33.9471 47.0655 33.7297 47.0655 33.4613V33.1171ZM49.6484 30.164H51.1657V31.0846C51.3123 30.686 51.4641 30.412 51.6184 30.2614C51.7743 30.1119 51.9662 30.0361 52.1946 30.0361C52.4333 30.0361 52.695 30.1357 52.9797 30.3327L52.4768 31.8682C52.2867 31.7617 52.1349 31.7096 52.0233 31.7096C51.9251 31.705 51.8277 31.7348 51.7409 31.796C51.6541 31.8573 51.581 31.9478 51.5289 32.0584C51.3618 32.3868 51.2782 33.0005 51.2782 33.9007V35.786H49.6484V30.164ZM57.7065 28.0239V35.786H56.1875V34.9548C55.9752 35.307 55.7817 35.5459 55.6061 35.6682C55.3725 35.8313 55.1117 35.9128 54.8253 35.9128C54.2482 35.9128 53.8083 35.6218 53.504 35.0386C53.1996 34.4566 53.0471 33.7489 53.0471 32.9167C53.0471 31.9848 53.2158 31.2714 53.5517 30.7766C53.8876 30.284 54.3147 30.0361 54.8329 30.0361C55.0853 30.0361 55.3146 30.0927 55.52 30.2059C55.7263 30.3191 55.9087 30.489 56.0681 30.7143V28.0251L57.7065 28.0239ZM56.0801 32.9586C56.0801 32.517 56.0102 32.1886 55.8687 31.9712C55.8039 31.8671 55.7222 31.7839 55.6298 31.7276C55.5374 31.6714 55.4366 31.6435 55.335 31.6462C55.2432 31.6454 55.1525 31.6731 55.0702 31.7272C54.9879 31.7813 54.9163 31.8602 54.8611 31.9576C54.7332 32.1659 54.6693 32.5158 54.6693 33.0061C54.6693 33.4647 54.7349 33.801 54.867 34.0139C54.9238 34.1142 54.9975 34.1955 55.0822 34.2514C55.1668 34.3072 55.2601 34.336 55.3546 34.3355C55.4539 34.3374 55.5521 34.3092 55.6419 34.2531C55.7317 34.1969 55.8107 34.1144 55.8729 34.0116C56.011 33.7965 56.0801 33.4455 56.0801 32.9586Z" fill="black"/>
                </svg>
                {/* Amex */}
                <svg width="65" height="41" viewBox="0 0 65 41" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-auto">
                  <path d="M60.4 0.399902H4.40002C2.19089 0.399902 0.400024 2.19076 0.400024 4.3999V36.3999C0.400024 38.609 2.19089 40.3999 4.40002 40.3999H60.4C62.6092 40.3999 64.4 38.609 64.4 36.3999V4.3999C64.4 2.19076 62.6092 0.399902 60.4 0.399902Z" fill="white" stroke="black" stroke-width="0.8"/>
                  <path d="M48.5438 35.7675H32.4757H16.2495V20.429V5.03271H32.2372H48.5438V20.5171V35.7675Z" fill="white"/>
                  <path d="M32.4582 16.166H30.0046L31.2314 13.3513L32.4582 16.166ZM34.0721 19.8147H36.8495L32.8599 11.213H29.6833L25.6937 19.8147H28.4053L29.1551 18.0934H33.3126L34.0745 19.8147H34.0721ZM46.1067 19.8147H48.5482V11.213H44.7533L42.7256 16.5714L40.7125 11.213H36.8519V19.8147H39.291V13.7937L41.6156 19.8147H43.7845L46.1091 13.7821V19.8147H46.1067ZM31.6209 27.675V26.336H36.7205V24.3946H31.6209V23.0556H36.8495V21.0656H29.1551V29.6673H36.8495V27.6773H31.6209V27.675ZM46.0653 25.3444L48.5482 27.858V22.8541L46.0653 25.3468V25.3444ZM45.3083 29.665H48.5482L44.2616 25.3398L48.5482 21.0633H45.3594L42.7134 23.8155L40.0918 21.0633H36.8495L41.1117 25.363L36.8495 29.665H39.9993L42.6599 26.8873L45.3058 29.665H45.3083ZM48.5482 35.767V30.8974H44.651L42.6453 28.787L40.6298 30.8974H27.7846V21.0587H23.6392L28.7826 9.98287H33.7435L35.5131 13.7775V9.98287H41.6521L42.7183 12.8416L43.7918 9.98287H48.5506V5.03223H16.2563V35.767H48.5506H48.5482Z" fill="#3C6CB1"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-gray-100 pt-8 md:flex-row">
          <p className="text-sm font-medium text-muted-foreground">© 2026 EdiCut Studios. All rights reserved.</p>
          <div className="flex gap-6 text-xs font-black uppercase tracking-widest text-muted-foreground">
             <span>Made for YouTubers</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-foreground">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="yt-tag text-primary">{children}</p>;
}

export function SectionIntro({ eyebrow, title, copy }: { eyebrow?: string; title: string; copy?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="yt-title mt-3 text-foreground">{title}</h2>
      {copy ? <p className="yt-subtitle mt-5">{copy}</p> : null}
    </div>
  );
}

export function ButtonLink({ to, children, variant = "primary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary"
    ? "bg-primary text-white [#D90000]"
    : "border border-gray-200 bg-white text-foreground secondary";
  return <Link to={to} className={`inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-sm font-black ${cls}`}>{children}</Link>;
}

export function TrustStrip() {
  return (
    <section className="border-y border-gray-100 bg-white px-5 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-black tracking-[0.22em] text-muted-foreground">
        {["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"].map((logo) => <span key={logo}>{logo}</span>)}
      </div>
    </section>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflow" className="bg-white px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Workflow" title="A simple path from raw footage to final delivery." />

        <div className="mt-14 hidden lg:block">
          <div className="grid grid-cols-5 items-end gap-6">
            {workflow.map(([step, title, , icon]) => (
              <div key={`visual-${step}`} className="flex min-w-0 flex-col items-center text-center">
                <span className="rounded-full bg-muted px-4 py-1.5 text-xs font-black uppercase text-foreground shadow-sm">
                  Step {Number(step)}
                </span>
                <div className={`mt-6 flex items-center justify-center text-primary ${step === "04" ? "h-40" : "h-28"}`}>
                  {step === "04" ? (
                    <div className="relative flex h-36 w-36 items-center justify-center rounded-full border-[3px] border-primary/25">
                      <span className="material-symbols-outlined absolute -top-3 right-7 rotate-[-22deg] bg-white text-primary" style={{ fontSize: 32 }}>navigation</span>
                      <span className="material-symbols-outlined drop-shadow-[14px_14px_0_rgba(0,0,0,0.06)]" style={{ fontSize: 68 }}>fact_check</span>
                      <span className="absolute bottom-2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-foreground shadow-sm">Feedback</span>
                    </div>
                  ) : (
                    <span className="material-symbols-outlined drop-shadow-[18px_18px_0_rgba(0,0,0,0.06)]" style={{ fontSize: 88 }}>
                      {icon}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="relative mx-auto mt-6 grid grid-cols-5 px-8">
            <div className="absolute left-10 right-10 top-1/2 h-5 -translate-y-1/2 rounded-full bg-primary shadow-[0_8px_22px_rgba(255,0,0,0.2)]">
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-around text-white/75">
                {workflow.slice(0, -1).map(([step]) => (
                  <span key={`arrow-${step}`} className="material-symbols-outlined text-[28px]">chevron_right</span>
                ))}
              </div>
            </div>
            {workflow.map(([step]) => (
              <div key={`node-${step}`} className="relative z-10 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-[6px] border-primary bg-white shadow-[0_10px_28px_rgba(255,0,0,0.2)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined text-[24px]">{step === "04" ? "sync" : step === "01" ? "radio_button_unchecked" : "check"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 grid grid-cols-5 gap-6">
            {workflow.map(([step, title, copy]) => (
              <article key={`copy-${step}`} className="min-w-0 text-center">
                <span className="rounded-full bg-muted px-4 py-1.5 text-xs font-black uppercase text-foreground">Step {Number(step)}</span>
                <h3 className="mx-auto mt-5 max-w-[13rem] text-2xl font-black leading-[1.08] tracking-tight text-foreground">{title}</h3>
                <p className="mx-auto mt-4 max-w-[14rem] text-base font-medium leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-4 lg:hidden">
          {workflow.map(([step, title, copy, icon], index) => (
            <article key={`mobile-${step}`} className="relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {index < workflow.length - 1 ? <div className="absolute bottom-[-1rem] left-[2.85rem] top-16 w-1 rounded-full bg-primary/20" /> : null}
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined" style={{ fontSize: 30 }}>{icon}</span>
              </div>
              <div className="min-w-0">
                <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-black uppercase text-foreground">Step {Number(step)}</span>
                <h3 className="mt-3 text-xl font-black leading-tight text-foreground">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortfolioSection({ full = false, sections, className = "" }: { full?: boolean; sections?: PortfolioSectionView[]; className?: string }) {
  const fallbackSections = useMemo<PortfolioSectionView[]>(() => [{
    id: "fallback-featured",
    name: "Featured",
    slug: "featured",
    active: true,
    sortOrder: 1,
    videos: portfolio.slice(0, 5).map((item, index) => ({
      id: `fallback-${item.title}`,
      title: item.title,
      creatorName: item.type,
      tag: item.tag,
      uniqueSellingPoint: item.tag,
      videoUrl: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
      youtubeId: "dQw4w9WgXcQ",
      thumbnailUrl: `https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=800&auto=format&fit=crop`,
      orientation: index % 3 === 0 ? "vertical" : "horizontal",
      sortOrder: index + 1,
    })),
  }], []);
  const portfolioSections = useMemo(() => {
    const source = sections?.length ? sections : fallbackSections;
    return source.filter((section) => section.slug && section.name);
  }, [fallbackSections, sections]);
  const firstTabSlug = portfolioSections[0]?.slug || "featured";
  const [activeTab, setActiveTab] = useState(firstTabSlug);
  const [playingItem, setPlayingItem] = useState<PortfolioVideo | null>(null);
  const activeSection = portfolioSections.find((section) => section.slug === activeTab) || portfolioSections[0];
  const displayPortfolio = useMemo(() => buildPortfolioLayout(activeSection?.videos || []), [activeSection]);

  useEffect(() => {
    if (!portfolioSections.some((section) => section.slug === activeTab)) {
      setActiveTab(firstTabSlug);
    }
  }, [activeTab, firstTabSlug, portfolioSections]);

  useEffect(() => {
    setPlayingItem(null);
  }, [activeTab]);

  useEffect(() => {
    if (!playingItem) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlayingItem(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [playingItem]);

  return (
    <section id="portfolio" className={`bg-white px-5 py-20 sm:px-6 ${className}`}>
      <div className="mx-auto max-w-7xl">
        <SectionIntro title="Edits built to keep viewers watching." />

        <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Portfolio categories">
          {portfolioSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveTab(section.slug)}
              role="tab"
              aria-selected={activeTab === section.slug}
              aria-controls={`portfolio-panel-${section.slug}`}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                activeTab === section.slug
                  ? "border-black bg-black text-white"
                  : "border-gray-200 bg-white text-muted-foreground hover:border-black hover:text-foreground"
              }`}
            >
              {section.name}
            </button>
          ))}
        </div>

        <div id={`portfolio-panel-${activeSection?.slug || "empty"}`} className="mt-10" role="tabpanel">
          <div className="grid gap-2">
            {displayPortfolio.length ? (
              <>
                <div className="grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_330px]">
                  {displayPortfolio[0] ? <PortfolioCard item={displayPortfolio[0]} variant="hero" onPlay={setPlayingItem} /> : null}
                  {displayPortfolio[1] ? (
                    <PortfolioCard
                      item={displayPortfolio[1]}
                      variant={displayPortfolio[1].orientation === "vertical" ? "reel" : "wide"}
                      featured={displayPortfolio[1].orientation === "vertical"}
                      onPlay={setPlayingItem}
                    />
                  ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {displayPortfolio.slice(2, 5).map((item) => (
                    <PortfolioCard key={item.id} item={item} variant="wide" onPlay={setPlayingItem} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {displayPortfolio.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm font-bold text-muted-foreground">
            No portfolio items found for {activeSection?.name || "this tab"}.
          </div>
        ) : null}
      </div>

      {playingItem ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${playingItem.title} video player`}
          onClick={() => setPlayingItem(null)}
        >
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPlayingItem(null)}
              className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:bg-primary hover:text-white"
              aria-label="Close video player"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
            <div className={`overflow-hidden rounded-[28px] bg-black shadow-2xl ${playingItem.orientation === "vertical" ? "mx-auto aspect-[9/16] max-h-[82vh] max-w-[460px]" : "aspect-video"}`}>
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${playingItem.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={`${playingItem.title} video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
    .sort((a, b) => Number(b.orientation === "horizontal") - Number(a.orientation === "horizontal") || a.sortOrder - b.sortOrder)
    .slice(0, 3);

  bottomVideos.forEach((video) => selectedIds.add(video.id));

  return [hero, reel, ...bottomVideos].filter((video): video is PortfolioVideo => Boolean(video));
}

function PortfolioCard({
  item,
  variant,
  featured = false,
  onPlay,
}: {
  item: PortfolioVideo;
  variant: "hero" | "wide" | "reel";
  featured?: boolean;
  onPlay: (item: PortfolioVideo) => void;
}) {
  const sizeClass = {
    hero: "aspect-[4/3] sm:aspect-video lg:aspect-auto lg:h-[514px]",
    wide: "aspect-video",
    reel: featured ? "aspect-[9/14] lg:h-[514px] lg:aspect-auto" : "aspect-[9/14]",
  }[variant];

  return (
    <button
      type="button"
      onClick={() => onPlay(item)}
      className={`group relative block overflow-hidden rounded-[28px] border border-white bg-black text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)] ${sizeClass}`}
      aria-label={`Play ${item.title} video`}
    >
      <img
        src={item.thumbnailUrl}
        alt={`${item.title} ${item.creatorName} video`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-black">{item.tag}</span>
      </div>

      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-110 group-hover:text-primary">
        <svg
          className="h-16 w-16"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M22 14.5 51 32 22 49.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-white">{item.uniqueSellingPoint}</span>
        </div>
        <p className="text-[11px] font-black uppercase text-white/70">{item.creatorName}</p>
        <h3 className={`${variant === "hero" ? "text-3xl sm:text-4xl" : "text-2xl"} mt-1 font-black text-white`}>{item.title}</h3>
      </div>
    </button>
  );
}

export function DifferentiatorsSection() {
  const items = [
    ["groups", "Creator-aware team", "Editors who understand hooks, pacing, chapters, intros, and retention curves."],
    ["timer", "Reliable turnaround", "A predictable 24-48 hour editing lane keeps your upload calendar moving."],
    ["monitoring", "Retention polish", "Pattern interrupts, captions, audio cleanup, and motion accents where they matter."],
    ["auto_awesome_mosaic", "Repurposing ready", "Turn long-form episodes into Shorts, TikToks, and Reels without starting over."],
  ];
  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <SectionIntro eyebrow="Why EdiCut" title="A production partner, not just an editing queue." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map(([icon, title, copy]) => (
            <article key={title} className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="material-symbols-outlined text-primary">{icon}</span>
              <h3 className="mt-5 text-xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingSection({ comparison = false, plans = defaultPlans }: { comparison?: boolean; plans?: PricingPlanView[] }) {
  const editingPlans = [
    {
      name: "Creator",
      slug: "creator",
      price: "$80",
      podcastPrice: "$160",
      vlogPrice: "$160",
      description: "A lean creator package for clean edits with subtitles, sound, color, stock assets, proofing, reels, and thumbnail support.",
      badge: "Base",
      icon: "smart_display",
      features: ["Subtitles", "Color grading", "Sound design & mixing", "Reels repurposing", "Thumbnail"],
    },
    {
      name: "Creator Plus",
      slug: "creator-plus",
      price: "$120",
      podcastPrice: "$240",
      vlogPrice: "$200",
      description: "For creators who need the core editing stack plus a stronger package price for podcast-length work and vlog footage.",
      badge: "Balanced",
      icon: "trending_up",
      popular: true,
      features: ["Subtitles", "Color grading", "Sound design & mixing", "Reels repurposing", "Thumbnail"],
    },
    {
      name: "Creator Pro",
      slug: "creator-pro",
      price: "$300",
      podcastPrice: "$600",
      vlogPrice: "$380",
      description: "The full creator package with project files, motion graphics, VFX, and AI voice over for more advanced edits.",
      badge: "Full stack",
      icon: "movie_filter",
      features: ["Everything in Creator Plus", "After Effects / Premiere Pro files", "Motion graphics", "VFX", "AI voice over"],
    },
  ];

  return (
    <section id="pricing" className="bg-white px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.45fr)] lg:items-end">
          <div>
            <Eyebrow>Variable packages</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">Creator packages built around footage and finished runtime.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Start with a base creator package, then price changes by podcast runtime, vlog raw footage, and advanced editing requirements.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-secondary p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Base scope bands</p>
            <div className="mt-3 grid gap-2">
              <ScopeRow icon="podcasts" label="Podcast run time" value="60 min" />
              <ScopeRow icon="video_file" label="Vlog raw footage" value="600 min" />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {editingPlans.map((plan) => {
            return (
              <article key={plan.name} className={`relative rounded-lg border bg-white p-5 ${plan.popular ? "border-primary shadow-xl shadow-red-500/10" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF0F0] text-primary">
                    <span className="material-symbols-outlined text-[21px]">{plan.icon}</span>
                  </span>
                  <span className={`rounded-md px-2.5 py-1 text-[11px] font-black uppercase ${plan.popular ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
                    {plan.badge}
                  </span>
                </div>

                <h3 className="mt-5 text-2xl font-black">{plan.name}</h3>
                <p className="mt-3 min-h-20 text-sm font-medium leading-6 text-muted-foreground">{plan.description}</p>

                <div className="mt-5 border-y border-gray-100 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Base price starts at</p>
                  <div className="mt-1 text-4xl font-black tracking-tight">{plan.price}</div>
                </div>

                <div className="mt-4 grid gap-2">
                  <ScopeRow icon="podcasts" label="60 min podcast" value={plan.podcastPrice} compact />
                  <ScopeRow icon="video_file" label="600 min vlog footage" value={plan.vlogPrice} compact />
                </div>

                <ul className="mt-5 grid gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm font-bold text-slate-800">
                      <span className="material-symbols-outlined text-[18px] text-primary">check</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link to={`/pricing/${plan.slug}`} className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black ${plan.popular ? "bg-primary text-white" : "bg-foreground text-white"}`}>
                  Choose subscription
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </article>
            );
          })}
        </div>

        <section className="mt-5 rounded-lg border border-gray-200 bg-secondary p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Quote factors</p>
              <h3 className="mt-2 text-2xl font-black">What changes the final price?</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[680px]">
              {[
                ["paid", "Creator base price", "$80, $120, or $300 depending on package level."],
                ["podcasts", "60 min run time", "Podcast-style work varies from $160 to $600."],
                ["video_file", "600 min raw footage", "Vlog raw footage varies from $160 to $380."],
                ["auto_awesome", "Advanced add-ons", "Project files, motion graphics, VFX, and AI voice over are Pro-only."],
              ].map(([icon, title, copy]) => (
                <div key={title} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
                    <p className="text-sm font-black">{title}</p>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {comparison ? <ComparisonTable /> : null}
      </div>
    </section>
  );
}

function ScopeRow({ icon, label, value, compact = false }: { icon: string; label: string; value: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
        <span className="truncate text-sm font-black">{label}</span>
      </div>
      <span className="shrink-0 text-sm font-black text-muted-foreground">{value}</span>
    </div>
  );
}

export function ComparisonTable() {
  const [featureMode, setFeatureMode] = useState<"key" | "all">("key");
  const packages = [
    ["Creator", "$80", "Core editing for creators who need clean delivery and essential channel assets."],
    ["Creator Plus", "$120", "A stronger lane for longer podcast runtime and larger vlog footage inputs."],
    ["Creator Pro", "$300", "Full-stack post-production with project files, motion graphics, VFX, and AI voice over."],
  ];
  const keyRows = [
    ["Base package", "$80", "$120", "$300"],
    ["60 min podcast/run time", "$160", "$240", "$600"],
    ["600 min raw vlog footage", "$160", "$200", "$380"],
    ["Subtitles", "Yes", "Yes", "Yes"],
    ["Color grading", "Yes", "Yes", "Yes"],
    ["Sound design & mixing", "Yes", "Yes", "Yes"],
    ["Content repurposing reels", "Yes", "Yes", "Yes"],
    ["Thumbnail", "Yes", "Yes", "Yes"],
    ["Advanced project files", "No", "No", "Yes"],
  ];
  const allRows = [
    ...keyRows.slice(0, 6),
    ["Royalty-free stock video", "Yes", "Yes", "Yes"],
    ["Royalty-free stock music", "Yes", "Yes", "Yes"],
    ["Video proofing tool", "Yes", "Yes", "Yes"],
    ...keyRows.slice(6, 8),
    ["After Effects / Premiere Pro files", "No", "No", "Yes"],
    ["Motion graphics", "No", "No", "Yes"],
    ["VFX", "No", "No", "Yes"],
    ["AI voice over", "No", "No", "Yes"],
  ];
  const rows = featureMode === "key" ? keyRows : allRows;

  return (
    <section className="mt-8 rounded-lg bg-[#F7FAFB] p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <h2 className="max-w-[230px] text-4xl font-black leading-tight tracking-tight text-foreground sm:text-[2.7rem]">Compare packages</h2>
          <p className="mt-4 max-w-[250px] text-base font-medium leading-7 text-muted-foreground">
            Choose the editing subscription that matches your footage volume, runtime, and advanced deliverables.
          </p>
          <div className="mt-6 inline-flex rounded-full bg-gray-200 p-1 text-xs font-black" role="tablist" aria-label="Compare feature mode">
            <button
              type="button"
              onClick={() => setFeatureMode("key")}
              aria-selected={featureMode === "key"}
              className={`rounded-full px-4 py-2 ${featureMode === "key" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Key features
            </button>
            <button
              type="button"
              onClick={() => setFeatureMode("all")}
              aria-selected={featureMode === "all"}
              className={`rounded-full px-4 py-2 ${featureMode === "all" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              All features
            </button>
          </div>
          <h3 className="mt-9 text-xl font-black">Package features</h3>
          <p className="mt-2 text-xs font-bold leading-5 text-muted-foreground">
            {featureMode === "key" ? "Showing the most important buying criteria." : "Showing every listed package feature."}
          </p>
        </aside>

        <div className="self-start lg:col-start-2">
          <div className="grid md:grid-cols-3">
            {packages.map(([name, price, copy], index) => (
              <article key={name} className={`h-fit border-r border-gray-100 bg-white p-5 last:border-r-0 ${index === 1 ? "relative z-10 ring-1 ring-primary" : ""}`}>
                <h3 className="text-lg font-black">{name}</h3>
                <p className="mt-3 text-4xl font-black tracking-tight">{price}<span className="text-sm font-bold text-muted-foreground"> base</span></p>
                <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-lg bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-black">Need a custom editing solution bigger than these packages?</p>
            <Link to="/contact#contact" className="inline-flex h-11 items-center justify-center rounded-lg bg-[#FFC46B] px-6 text-sm font-black text-foreground">
              Book call
            </Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[230px_repeat(3,minmax(150px,1fr))] border-b border-gray-200 bg-[#FBFCFD]">
                <div className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Package features</div>
                {packages.map(([name]) => (
                  <div key={name} className="border-l border-gray-200 px-4 py-3 text-center text-sm font-black">{name}</div>
                ))}
              </div>
              {rows.map(([label, creator, plus, pro]) => (
                <div key={label} className="grid grid-cols-[230px_repeat(3,minmax(150px,1fr))] border-b border-gray-100 last:border-b-0">
                  <div className="flex min-h-[46px] items-center px-4 text-sm font-black text-foreground">{label}</div>
                  {[creator, plus, pro].map((value, index) => (
                    <div key={`${label}-${index}`} className="flex min-h-[46px] items-center justify-center border-l border-gray-100 px-4 text-center text-sm font-bold text-foreground">
                      <FeatureValue value={value} />
                    </div>
                  ))}
                </div>
              ))}
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
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map(([quote, name, role]) => (
            <article key={name} className="rounded-2xl border border-gray-200 bg-white p-7">
              <p className="text-lg font-bold leading-8">"{quote}"</p>
              <p className="mt-6 font-black">{name}</p>
              <p className="mt-1 text-sm font-bold text-muted-foreground">{role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="bg-white px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionIntro eyebrow="FAQ" title="What creators usually ask before starting." />
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-6" open={q === faqs[0][0]}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-black">
                {q}<span className="material-symbols-outlined text-muted-foreground group-open:rotate-180">expand_more</span>
              </summary>
              <p className="mt-4 leading-7 text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection({ compact = false, status }: { compact?: boolean; status?: "sent" | "security-error" | "invalid-error" }) {
  const [securityError, setSecurityError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.currentTarget.dataset.recaptchaReady === "true") {
      event.currentTarget.dataset.recaptchaReady = "false";
      return;
    }

    event.preventDefault();
    setSecurityError(null);

    try {
      await executeInvisibleRecaptcha(event.currentTarget, "contact_inquiry");
      event.currentTarget.dataset.recaptchaReady = "true";
      event.currentTarget.requestSubmit();
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Security check failed. Please try again.");
    }
  }

  return (
    <section id="contact" className="px-5 py-20 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.75fr]">
        <div>
          <Eyebrow>Contact us</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Tell us what you are editing next.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">We will review your channel and match you with the most efficient editing lane for your upload rhythm.</p>
        </div>
        <form method="post" action="/contact" className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
          <input type="hidden" name="g-recaptcha-response" value="" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" name="name" required />
            <Input label="Email" name="email" type="email" required />
          </div>
          {!compact ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Project type" name="projectType" />
              <Input label="Monthly volume" name="monthlyVolume" />
            </div>
          ) : null}
          <label className="grid gap-2 text-sm font-black">
            Message
            <textarea name="brief" required minLength={20} className="min-h-28 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium outline-none focus:border-foreground" />
          </label>
          <button type="submit" className="rounded-2xl bg-primary px-5 py-4 text-sm font-black text-white">Send inquiry</button>
          {status === "sent" ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-black text-primary">Message sent. We will reply shortly.</p> : null}
          {securityError || status === "security-error" ? <p className="rounded-xl bg-[#FFF5F5] px-4 py-3 text-sm font-black text-[#D90000]">{securityError || "Security check failed. Please try again."}</p> : null}
          {status === "invalid-error" ? <p className="rounded-xl bg-[#FFF5F5] px-4 py-3 text-sm font-black text-[#D90000]">Check the form details and try again.</p> : null}
          <p className="text-sm font-bold text-muted-foreground">hello@edicut.com · Replies within 24 hours</p>
        </form>
      </div>
    </section>
  );
}

function Input({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input name={name} type={type} required={required} className="h-12 rounded-xl border border-gray-200 bg-white px-4 font-medium outline-none focus:border-foreground" />
    </label>
  );
}

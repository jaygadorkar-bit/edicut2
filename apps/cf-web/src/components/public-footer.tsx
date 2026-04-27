import Link from "next/link";
import { Clapperboard } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="bg-[#050505] pt-24 pb-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 md:grid-cols-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="group mb-6 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
                <Clapperboard className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-3xl font-black tracking-tighter text-white">
                Edi<span className="text-primary">Cut</span>
              </span>
            </Link>
            <p className="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
              Editing support for YouTubers who need sharper videos, faster
              turnaround, and a repeatable upload workflow.
            </p>
          </div>
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white">
              Platform
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/portfolio"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Portfolio
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white">
              Company
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/about"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white">
              Connect
            </h4>
            <ul className="space-y-4">
              <li>
                <a
                  href="#"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Twitter // X
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  YouTube
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-24 flex flex-col items-center justify-between border-t border-border/20 pt-8 md:flex-row">
          <p className="text-xs font-medium text-muted-foreground">
            &copy; {new Date().getFullYear()} EdiCut. All rights reserved.
          </p>
          <p className="mt-4 text-xs font-medium text-muted-foreground md:mt-0">
            Made with <span className="text-primary">love</span> for YouTubers
          </p>
        </div>
      </div>
    </footer>
  );
}

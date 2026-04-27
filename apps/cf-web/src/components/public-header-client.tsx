"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clapperboard, Menu, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NavItem {
  name: string;
  href: string;
}

const navItems: NavItem[] = [
  { name: "Home", href: "/" },
  { name: "Pricing", href: "/pricing" },
  { name: "Portfolio", href: "/portfolio" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

export function PublicHeaderClient({
  session,
}: {
  session: Session | null;
}) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "border-b border-white/10 bg-black/80 backdrop-blur-xl py-4"
          : "bg-transparent py-6"
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
              <Clapperboard className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">
              Edi<span className="text-primary">Cut</span>
            </span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "px-4 py-2 text-sm font-semibold transition-all rounded-lg hover:bg-white/5",
                pathname === item.href
                  ? "text-primary"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 sm:flex">
            {session?.user ? (
              <Button
                asChild
                className="rounded-xl font-bold shadow-lg shadow-primary/20"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-bold text-zinc-400 hover:text-white transition-colors px-4"
                >
                  Sign In
                </Link>
                <Button
                  asChild
                  className="rounded-xl font-bold shadow-lg shadow-primary/20 bg-primary/90 hover:bg-primary text-primary-foreground"
                >
                  <Link href="/pricing" className="flex items-center gap-2">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-white hover:bg-white/10 rounded-xl"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-black border-white/10 p-0">
              <SheetHeader className="p-6 border-b border-white/10">
                <SheetTitle className="text-left flex items-center gap-2">
                   <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Clapperboard className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="text-xl font-black tracking-tighter text-white">
                    Edi<span className="text-primary">Cut</span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 p-6">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between p-4 text-lg font-bold rounded-2xl transition-all",
                      pathname === item.href
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {item.name}
                    <ArrowRight className={cn("h-5 w-5 opacity-0 transition-all", pathname === item.href && "opacity-100 translate-x-0")} />
                  </Link>
                ))}
                <div className="mt-8 pt-8 border-t border-white/10 flex flex-col gap-4">
                  {session?.user ? (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-2xl font-bold h-14 text-lg"
                    >
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button
                        asChild
                        variant="outline"
                        size="lg"
                        className="rounded-2xl font-bold h-14 text-lg border-white/10 text-white hover:bg-white/5"
                      >
                        <Link href="/login">Sign In</Link>
                      </Button>
                      <Button
                        asChild
                        size="lg"
                        className="rounded-2xl font-bold h-14 text-lg bg-primary text-primary-foreground shadow-xl shadow-primary/20"
                      >
                        <Link href="/pricing">Get Started</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}

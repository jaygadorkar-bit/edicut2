import { Link } from "react-router";
import { LogoMark } from "./Header";
  import { navLinks, legalLinks } from "../site/data";

export function Footer() {
  return (
    <footer className="px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 border-t border-gray-100 pt-8 text-center md:flex-row md:text-left">
        <Link to="/" className="-opacity ">
          <LogoMark />
        </Link>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold text-muted-foreground">
          {navLinks.map((item) => (
            <Link key={item.label} to={item.to} className="foreground">
              {item.label}
            </Link>
          ))}
          {legalLinks.map((item) => (
            <Link key={item.label} to={item.to} className="foreground">
              {item.label}
            </Link>
          ))}
        </div>
        <p className="text-sm font-medium text-muted-foreground">© 2026 EdiCut Studios. All rights reserved.</p>
      </div>
    </footer>
  );
}

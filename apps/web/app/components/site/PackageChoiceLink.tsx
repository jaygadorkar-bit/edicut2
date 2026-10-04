import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import "../../styles/package-choice.css";

export function PackageChoiceLink({ to, label, className = "", delay = 0 }: { to: string; label: string; className?: string; delay?: number }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [noticed, setNoticed] = useState(false);

  useEffect(() => {
    const link = linkRef.current;
    if (!link || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNoticed(true);
        observer.disconnect();
      }
    }, { threshold: 0.8 });
    observer.observe(link);
    return () => observer.disconnect();
  }, []);

  return <Link ref={linkRef} to={to} className={`neo-button package-choice-link ${noticed ? "is-noticed" : ""} ${className}`} style={{ animationDelay: `${delay}ms` }}>
    <span className="package-choice-link__text">{label}</span><ArrowRight size={17} aria-hidden="true" />
  </Link>;
}

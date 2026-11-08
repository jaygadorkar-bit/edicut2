import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import type { BlogSection } from "../../lib/blog";

export function BlogContents({ sections, serviceLink = { to: "/services/youtube-video-editing", label: "YouTube editing service" } }: {
  sections: BlogSection[];
  serviceLink?: { to: string; label: string };
}) {
  const ids = useMemo(() => [...sections.map(section => section.id), "questions"], [sections]);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = Math.min(200, window.innerHeight * 0.25);
      let next = "";
      for (const id of ids) {
        const target = document.getElementById(id);
        if (target && target.getBoundingClientRect().top <= marker) next = id;
      }
      setCurrent(previous => previous === next ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [ids]);

  return <aside className="blog-contents">
    <nav aria-labelledby="blog-contents-title"><h2 id="blog-contents-title">In this guide</h2><ol>{sections.map(section => <li key={section.id}><a href={`#${section.id}`} aria-current={current === section.id ? "location" : undefined}>{section.title}</a></li>)}<li><a href="#questions" aria-current={current === "questions" ? "location" : undefined}>Common questions</a></li></ol></nav>
    <Link to={serviceLink.to} className="blog-sidebar-link">Explore EdiCut’s<br />{serviceLink.label} <ArrowUpRight size={18} aria-hidden="true" /></Link>
  </aside>;
}

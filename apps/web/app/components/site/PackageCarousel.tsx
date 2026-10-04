import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function PackageCarousel({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0, active: false, moved: false });
  const [edges, setEdges] = useState({ start: true, end: false });
  const [dragging, setDragging] = useState(false);
  function syncEdges() {
    const element = scroller.current;
    if (element) {
      const next = { start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 };
      setEdges(previous => previous.start === next.start && previous.end === next.end ? previous : next);
    }
  }
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(element);
    syncEdges();
    return () => observer.disconnect();
  }, []);
  function move(direction: number) {
    const element = scroller.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    element.scrollBy({ left: direction * ((card?.offsetWidth ?? 300) + 16), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <div className="package-carousel">
    <div className="package-carousel-tools"><p>Find your fit. Swipe or browse.</p><div>
      <button type="button" aria-label="Previous packages" aria-controls="package-options-slider" disabled={edges.start} onClick={() => move(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
      <button type="button" aria-label="Next packages" aria-controls="package-options-slider" disabled={edges.end} onClick={() => move(1)}><ArrowRight size={18} aria-hidden="true" /></button>
    </div></div>
    <div id="package-options-slider" ref={scroller} className={`package-options-slider${dragging ? " is-dragging" : ""}`} role="region" aria-label="Other editing packages" tabIndex={0} onScroll={syncEdges} onDragStart={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
      }}
      onPointerDown={event => {
        drag.current.moved = false;
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, active: true, moved: false };
      }}
      onPointerMove={event => {
        if (!drag.current.active || Math.abs(event.clientX - drag.current.x) < 6) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current.moved = true;
        setDragging(true);
        event.currentTarget.scrollLeft = drag.current.scroll - (event.clientX - drag.current.x);
      }}
      onPointerUp={event => {
        drag.current.active = false;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current.active = false; setDragging(false); }}
      onClickCapture={event => {
        if (drag.current.moved && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
        drag.current.moved = false;
      }}>{children}</div>
  </div>;
}

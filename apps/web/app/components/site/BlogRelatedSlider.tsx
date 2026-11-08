import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { BlogPost } from "../../lib/blog";
import { BlogCard } from "./Blog";

export function BlogRelatedSlider({ posts }: { posts: BlogPost[] }) {
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, x: 0, y: 0, left: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ start: true, end: false, first: 1, last: 1 });

  function syncPosition() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const viewport = scroller.getBoundingClientRect();
    const visible = Array.from(scroller.children).flatMap((slide, index) => {
      const bounds = slide.getBoundingClientRect();
      return bounds.right > viewport.left + 2 && bounds.left < viewport.right - 2 ? [index + 1] : [];
    });
    const next = {
      start: scroller.scrollLeft <= 2,
      end: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2,
      first: visible[0] ?? 1,
      last: visible.at(-1) ?? 1,
    };
    setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(syncPosition);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    syncPosition();
    return () => observer.disconnect();
  }, [posts]);

  function move(direction: number) {
    const scroller = scrollerRef.current;
    const first = scroller?.firstElementChild;
    const second = first?.nextElementSibling;
    if (!scroller || !first) return;
    const step = second ? second.getBoundingClientRect().left - first.getBoundingClientRect().left : scroller.clientWidth;
    const left = direction === -Infinity ? 0
      : direction === Infinity ? scroller.scrollWidth - scroller.clientWidth
        : (Math.round(scroller.scrollLeft / step) + direction) * step;
    scroller.scrollTo({
      left: Math.max(0, Math.min(left, scroller.scrollWidth - scroller.clientWidth)),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    move(direction);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pointerId = -1;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!posts.length) return null;

  return <section className="blog-related" aria-labelledby={`${id}-heading`}>
    <div className="blog-section-heading blog-related__heading">
      <h2 id={`${id}-heading`}>Keep your next upload moving</h2>
      <div className="blog-related__tools">
        <Link to="/blog">All guides <ArrowUpRight size={17} aria-hidden="true" /></Link>
        {posts.length > 1 ? <div className="blog-related__arrows">
          <button type="button" aria-label="Previous guides" aria-controls={`${id}-track`} disabled={position.start} onClick={() => move(-1)}><ArrowLeft size={20} aria-hidden="true" /></button>
          <button type="button" aria-label="Next guides" aria-controls={`${id}-track`} disabled={position.end} onClick={() => move(1)}><ArrowRight size={20} aria-hidden="true" /></button>
        </div> : null}
      </div>
    </div>
    <p className="sr-only" id={`${id}-help`}>Use the left and right arrow keys to browse, or swipe. Home and End move to the first and last guides.</p>
    <div
      id={`${id}-track`}
      ref={scrollerRef}
      className={`blog-related__scroller${dragging ? " is-dragging" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Related editing guides"
      aria-describedby={`${id}-help`}
      tabIndex={0}
      onScroll={syncPosition}
      onKeyDown={handleKeyDown}
      onDragStart={event => event.preventDefault()}
      onPointerDown={event => {
        dragRef.current.moved = false;
        // Leave touch swipes and vertical page scrolling to the browser.
        if (event.pointerType !== "mouse" || event.button !== 0 || event.isPrimary === false) return;
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (drag.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - drag.x;
        if (!drag.moved && Math.abs(deltaX) < 6) return;
        if (!drag.moved && Math.abs(event.clientY - drag.y) > Math.abs(deltaX)) {
          drag.pointerId = -1;
          return;
        }
        if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
        drag.moved = true;
        setDragging(true);
        event.preventDefault();
        event.currentTarget.scrollLeft = drag.left - deltaX;
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={event => {
        if (dragRef.current.pointerId === event.pointerId) {
          dragRef.current.pointerId = -1;
          setDragging(false);
        }
      }}
      onPointerLeave={() => {
        if (!dragRef.current.moved) dragRef.current.pointerId = -1;
      }}
      onClickCapture={event => {
        if (dragRef.current.moved && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
        dragRef.current.moved = false;
      }}
    >
      {posts.map((post, index) => <div className="blog-related__slide" key={post.slug} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${posts.length}`}><BlogCard post={post} /></div>)}
    </div>
    <div className="blog-related__footer">
      <span>Swipe or drag to explore</span>
      <span role="status" aria-live="polite" aria-atomic="true">{position.first === position.last ? `Guide ${position.first}` : `Guides ${position.first}–${position.last}`} of {posts.length}</span>
    </div>
  </section>;
}

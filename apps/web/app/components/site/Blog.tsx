import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { blogReadingMinutes, type BlogPost } from "../../lib/blog";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export function BlogDate({ date }: { date: string }) {
  return <time dateTime={date}>{dateFormatter.format(new Date(`${date}T00:00:00Z`))}</time>;
}

export function BlogCover({ post, eager = false, sizes = "(max-width: 700px) calc(100vw - 32px), 50vw" }: {
  post: BlogPost; eager?: boolean; sizes?: string;
}) {
  const srcSet = post.coverImage.endsWith("-1280.webp")
    ? `${post.coverImage.replace(/-1280\.webp$/, "-640.webp")} 640w, ${post.coverImage} 1280w`
    : undefined;
  return <img
    className="blog-cover"
    src={post.coverImage}
    srcSet={srcSet}
    sizes={sizes}
    width={1536}
    height={1024}
    alt={post.coverAlt}
    loading={eager ? "eager" : "lazy"}
    fetchPriority={eager ? "high" : "auto"}
    decoding="async"
  />;
}

export function BlogReadTime({ post }: { post: BlogPost }) {
  return <span className="blog-read-time"><Clock3 size={15} aria-hidden="true" />{blogReadingMinutes(post)} min read</span>;
}

export function BlogCard({ post }: { post: BlogPost }) {
  const titleId = `story-${post.slug}`;
  return <article className="blog-story">
    <Link to={`/blog/${post.slug}`} className="blog-story-link" aria-labelledby={titleId}>
      <div className="blog-story-art"><BlogCover post={post} sizes="(max-width: 520px) calc(100vw - 32px), (max-width: 900px) 50vw, 32vw" /></div>
      <div className="blog-story-copy">
        <span className="blog-category">{post.category}</span>
        <h3 id={titleId}>{post.title}</h3>
        <p>{post.excerpt}</p>
        <div className="blog-story-footer">
          <div className="blog-story-meta"><BlogDate date={post.publishedAt} /><BlogReadTime post={post} /></div>
          <span className="blog-read-link"><span className="blog-read-link-label">Read the guide</span><span className="blog-read-link-icon"><ArrowUpRight size={18} aria-hidden="true" /></span></span>
        </div>
      </div>
    </Link>
  </article>;
}

export function BlogStories({ posts }: { posts: BlogPost[] }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const categories = [...new Set(posts.map(post => post.category))];
  const [displayedCategory, setDisplayedCategory] = useState("all");
  const [isSwitching, setIsSwitching] = useState(false);
  const filterId = useId();
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [tabIndicator, setTabIndicator] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const visiblePosts = displayedCategory === "all"
    ? posts
    : posts.filter(post => post.category === displayedCategory);

  useEffect(() => {
    if (activeCategory === displayedCategory) {
      setIsSwitching(false);
      return;
    }

    setIsSwitching(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => {
      setDisplayedCategory(activeCategory);
      setIsSwitching(false);
    }, reducedMotion ? 0 : 160);
    return () => window.clearTimeout(timeout);
  }, [activeCategory, displayedCategory]);

  useLayoutEffect(() => {
    const updateTabIndicator = () => {
      const tabList = tabListRef.current;
      const activeButton = tabRefs.current[activeCategory];
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
  }, [activeCategory, categories.join("|")]);

  const selectTab = (category: string) => setActiveCategory(category);
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % (categories.length + 1);
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + categories.length + 1) % (categories.length + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = categories.length;
    else return;

    event.preventDefault();
    const nextCategory = nextIndex === 0 ? "all" : categories[nextIndex - 1];
    selectTab(nextCategory);
    tabRefs.current[nextCategory]?.focus();
  };

  return <section className="blog-latest" aria-labelledby="blog-guides-heading">
    <h2 id="blog-guides-heading" className="sr-only">Video editing articles</h2>
    <div ref={tabListRef} className="blog-topic-filter neo-inset neo-portfolio-tabs" role="tablist" aria-label="Filter guides by topic">
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
      <button
        ref={(node) => { tabRefs.current.all = node; }}
        type="button"
        id={`${filterId}-tab-all`}
        role="tab"
        tabIndex={activeCategory === "all" ? 0 : -1}
        aria-selected={activeCategory === "all"}
        aria-controls={`${filterId}-panel`}
        className={`neo-portfolio-tab ${activeCategory === "all" ? "neo-portfolio-tab--active" : "neo-portfolio-tab--inactive"}`}
        onClick={() => selectTab("all")}
        onKeyDown={(event) => handleTabKeyDown(event, 0)}
      >All guides <span>{posts.length}</span></button>
      {categories.map(category => {
        const count = posts.filter(post => post.category === category).length;
        const index = categories.indexOf(category) + 1;
        return <button
          key={category}
          ref={(node) => { tabRefs.current[category] = node; }}
          type="button"
          id={`${filterId}-tab-${index}`}
          role="tab"
          tabIndex={activeCategory === category ? 0 : -1}
          aria-selected={activeCategory === category}
          aria-controls={`${filterId}-panel`}
          className={`neo-portfolio-tab ${activeCategory === category ? "neo-portfolio-tab--active" : "neo-portfolio-tab--inactive"}`}
          onClick={() => selectTab(category)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
        >{category}<span>{count}</span></button>;
      })}
    </div>
    <p className="sr-only" aria-live="polite">Showing {visiblePosts.length} {visiblePosts.length === 1 ? "guide" : "guides"}</p>
    <div
      key={displayedCategory}
      id={`${filterId}-panel`}
      role="tabpanel"
      aria-labelledby={activeCategory === "all" ? `${filterId}-tab-all` : `${filterId}-tab-${categories.indexOf(activeCategory) + 1}`}
      aria-busy={isSwitching}
      tabIndex={0}
      inert={isSwitching}
      className={`blog-story-grid neo-portfolio-panel ${isSwitching ? "is-switching" : ""} ${visiblePosts.length === 1 ? "blog-story-grid--single" : visiblePosts.length === 2 ? "blog-story-grid--double" : ""}`}
    >
      {visiblePosts.map((post, index) => <div key={post.slug} className="blog-story--enter" style={{ animationDelay: `${Math.min(index, 3) * 55}ms` }}><BlogCard post={post} /></div>)}
    </div>
  </section>;
}

/** Render our small editorial link format without accepting HTML or executable URLs. */
export function BlogText({ children }: { children: string }) {
  const parts = children.split(/(\[[^\]\n]+\]\((?:\/(?!\/)[^\s)]*|https:\/\/[^\s)]+)\))/g);
  return <>{parts.map((part, index) => {
    const match = /^\[([^\]\n]+)\]\(([^\s)]+)\)$/.exec(part);
    if (!match) return <Fragment key={index}>{part}</Fragment>;
    return match[2].startsWith("/")
      ? <Link key={index} to={match[2]}>{match[1]}</Link>
      : <a key={index} href={match[2]}>{match[1]}</a>;
  })}</>;
}

export function BlogCta() {
  return <section className="blog-cta" aria-labelledby="blog-cta-title">
    <div><h2 id="blog-cta-title">Your next video, with a clear plan.</h2><p>Share your footage, format, and deadline. We’ll help you find the right editing scope.</p></div>
    <Link className="neo-button neo-button--primary" to="/contact">Discuss your project <ArrowUpRight size={18} aria-hidden="true" /></Link>
  </section>;
}

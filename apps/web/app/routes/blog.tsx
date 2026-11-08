import type { MetaFunction } from "react-router";
import { PageShell } from "../components/site/Marketing";
import { BlogStories } from "../components/site/Blog";
import { BLOG_POSTS } from "../lib/blog";
import { blogIndexRouteMeta, blogIndexStructuredData, serializeJsonLd } from "../lib/blog-seo";
import "../styles/blog.css";

export const meta: MetaFunction = blogIndexRouteMeta;

export default function BlogPage() {
  return <PageShell className="blog-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogIndexStructuredData(BLOG_POSTS)) }} />
    <div className="blog-container">
      <section className="blog-index-hero" aria-labelledby="blog-index-title">
        <header className="blog-index-heading">
          <h1 id="blog-index-title" className="yt-display">Video editing guides<br className="blog-desktop-break" /> for your next upload.</h1>
          <p className="yt-subtitle">Practical notes for YouTube creators. Plan the brief, find your editing partner, and give every format a purpose.</p>
        </header>
      </section>
      <BlogStories posts={BLOG_POSTS} />
    </div>
  </PageShell>;
}

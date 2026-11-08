import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { isRouteErrorResponse, Link, useLoaderData, useRouteError } from "react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageShell } from "../components/site/Marketing";
import { BlogCover, BlogCta, BlogDate, BlogReadTime, BlogText } from "../components/site/Blog";
import { BlogContents } from "../components/site/BlogContents";
import { BlogRelatedSlider } from "../components/site/BlogRelatedSlider";
import { BLOG_POSTS, getBlogPost } from "../lib/blog";
import { blogPostRouteMeta, blogPostStructuredData, serializeJsonLd } from "../lib/blog-seo";
import "../styles/blog.css";

export function loader({ params }: LoaderFunctionArgs) {
  const post = getBlogPost(params.slug);
  if (!post) throw new Response("Article not found", { status: 404 });
  return { post };
}

export const meta: MetaFunction<typeof loader> = args => blogPostRouteMeta(args, args.loaderData?.post);

export default function BlogPostPage() {
  const { post } = useLoaderData<typeof loader>();
  const related = BLOG_POSTS.filter(item => item.slug !== post.slug)
    .sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category));
  return <PageShell className="blog-page blog-article-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogPostStructuredData(post)) }} />
    <div className="blog-container">
      <nav className="blog-breadcrumb" aria-label="Breadcrumb"><ol><li><Link to="/">Home</Link></li><li><Link to="/blog">Blog</Link></li><li aria-current="page"><span>{post.title}</span></li></ol></nav>
      <article>
        <header className="blog-article-heading">
          <p className="blog-category neo-section-label">{post.category}</p>
          <h1 className="yt-display">{post.title}</h1>
          <p className="blog-article-deck yt-subtitle">{post.excerpt}</p>
          <div className="blog-byline"><Link to="/blog">By {post.author}</Link><BlogDate date={post.publishedAt} /><BlogReadTime post={post} /></div>
        </header>
        <figure className="blog-article-art"><BlogCover post={post} eager sizes="(max-width: 1248px) calc(100vw - 32px), 1184px" /><figcaption>Original artwork for the EdiCut blog.</figcaption></figure>
        <div className="blog-reading-layout">
          <BlogContents sections={post.sections} serviceLink={post.serviceLink} />
          <div className="blog-prose">
            <div className="blog-article-intro">{post.intro.map((paragraph, index) => <p key={index}><BlogText>{paragraph}</BlogText></p>)}</div>
            {post.sections.map(section => <section className="blog-chapter" id={section.id} key={section.id}><h2>{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}><BlogText>{paragraph}</BlogText></p>)}{section.bullets ? <ul>{section.bullets.map(item => <li key={item}><BlogText>{item}</BlogText></li>)}</ul> : null}</section>)}
            <section className="blog-takeaway" aria-labelledby="blog-takeaway-title"><h2 id="blog-takeaway-title">The takeaway</h2><p><BlogText>{post.takeaway}</BlogText></p></section>
            <section className="blog-questions" id="questions" aria-labelledby="blog-questions-title"><h2 id="blog-questions-title">Common questions</h2>{post.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p><BlogText>{faq.answer}</BlogText></p></details>)}</section>
            {post.sources?.length ? <section className="blog-sources" aria-labelledby="blog-sources-title"><h2 id="blog-sources-title">Further reading</h2><ul>{post.sources.map(source => <li key={source.url}><a href={source.url}>{source.label}<ArrowUpRight size={15} aria-hidden="true" /></a></li>)}</ul></section> : null}
            <div className="blog-back"><Link to="/blog"><ArrowLeft size={17} aria-hidden="true" />All EdiCut guides</Link></div>
          </div>
        </div>
      </article>
      <BlogCta />
      <BlogRelatedSlider posts={related} />
    </div>
  </PageShell>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <PageShell className="blog-page"><div className="blog-container blog-error"><p className="blog-label">EdiCut blog</p><h1>{missing ? "That article isn’t here." : "This article couldn’t load."}</h1><p>{missing ? "Explore our guides to choosing an editor, preparing your brief, and creating Shorts." : "Please refresh the page or return to the blog to choose another guide."}</p><Link to="/blog" className="neo-button neo-button--primary"><ArrowLeft size={18} aria-hidden="true" />Back to the blog</Link></div></PageShell>;
}

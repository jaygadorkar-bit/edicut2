import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PageShell } from "../components/site/Marketing";
import { HireEdicutStory } from "../components/site/HireEdicutStory";
import { getBlogPost } from "../lib/blog";
import { blogPostRouteMeta, blogPostStructuredData, serializeJsonLd } from "../lib/blog-seo";
import "../styles/blog.css";

export function loader() {
  const post = getBlogPost("3-reasons-why-you-should-hire-edicut");
  if (!post) throw new Response("Article not found", { status: 404 });
  return { post };
}

export const meta: MetaFunction<typeof loader> = args => blogPostRouteMeta(args, args.loaderData?.post);

export default function HireEdicutBlogPage() {
  const { post } = useLoaderData<typeof loader>();
  return <PageShell className="blog-page hire-edicut-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogPostStructuredData(post)) }} />
    <div className="blog-container"><HireEdicutStory post={post} /></div>
  </PageShell>;
}

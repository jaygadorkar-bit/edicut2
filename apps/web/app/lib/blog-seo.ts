import type { MetaDescriptor } from "react-router";
import type { BlogPost } from "./blog";
import { createPageMeta, createSiteStructuredData, getCanonicalSiteOrigin, serializeJsonLd, type SeoRouteArgs } from "./seo";

type BlogSeoContext = {
  appUrl?: string;
  pathname?: string;
  crawlingEnabled?: boolean;
  maintenanceModeEnabled?: boolean;
};

const BLOG_TITLE = "Video Editing Guides & Studio Insights | EdiCut Blog";
const BLOG_DESCRIPTION =
  "Explore EdiCut’s video editing guides and studio insights: choose an editing partner, plan your brief, repurpose videos, and understand our service.";

function blogMeta(title: string, description: string, imagePath: string, imageAlt: string, context: BlogSeoContext, ogType = "article", publishedAt?: string, socialImagePath = imagePath): MetaDescriptor[] {
  const base = createPageMeta(title, description, {
    ...context,
    pathname: context.pathname ?? "/blog",
  });
  const imageUrl = `${getCanonicalSiteOrigin(context.appUrl)}${socialImagePath}`;
  const adjusted = base.map((descriptor) => {
    const item = descriptor as Record<string, unknown>;
    if (item.tagName === "link" || !("property" in item || "name" in item)) return descriptor;
    if (item.property === "og:type") return { ...descriptor, content: ogType } as MetaDescriptor;
    if (item.property === "og:image") return { ...descriptor, content: imageUrl } as MetaDescriptor;
    if (item.property === "og:image:type") return { ...descriptor, content: "image/webp" } as MetaDescriptor;
    if (item.property === "og:image:width") return { ...descriptor, content: "1536" } as MetaDescriptor;
    if (item.property === "og:image:height") return { ...descriptor, content: "1024" } as MetaDescriptor;
    if (item.property === "og:image:alt") return { ...descriptor, content: imageAlt } as MetaDescriptor;
    if (item.name === "twitter:image") return { ...descriptor, content: imageUrl } as MetaDescriptor;
    return descriptor;
  });
  adjusted.push({ name: "twitter:image:alt", content: imageAlt });
  if (ogType === "article" && publishedAt) adjusted.push({ property: "article:published_time", content: publishedAt });
  return adjusted;
}

export function blogIndexMeta(context: BlogSeoContext = {}): MetaDescriptor[] {
  return blogMeta(BLOG_TITLE, BLOG_DESCRIPTION, "/images/blog/choose-editing-partner.svg", "A creator’s video edit beside a selected editor profile and a review checkmark", {
    ...context,
    pathname: context.pathname ?? "/blog",
  }, "website", undefined, "/images/blog/choose-editing-partner.webp");
}

export function blogSeoContext(args: SeoRouteArgs): BlogSeoContext {
  const rootData = args.matches.find((match) => match.id === "root")?.loaderData as {
    appUrl?: string;
    searchCrawlingEnabled?: boolean;
    maintenanceModeEnabled?: boolean;
  } | undefined;
  return {
    appUrl: rootData?.appUrl,
    pathname: args.location.pathname,
    crawlingEnabled: rootData?.searchCrawlingEnabled !== false && args.error == null,
    maintenanceModeEnabled: rootData?.maintenanceModeEnabled === true,
  };
}

export function blogIndexRouteMeta(args: SeoRouteArgs): MetaDescriptor[] {
  return blogIndexMeta(blogSeoContext(args));
}

export function blogPostRouteMeta(args: SeoRouteArgs, post?: BlogPost): MetaDescriptor[] {
  const context = blogSeoContext(args);
  return post
    ? blogPostMeta(post, context)
    : blogMeta("Article not found | EdiCut", "This blog article is unavailable.", "/images/blog/youtube-editing-service.webp", "Illustrated filmstrip of landscape frames with a selection cursor and red checkmark", {
      ...context,
      crawlingEnabled: false,
    });
}

export function blogPostMeta(post: BlogPost, context: BlogSeoContext = {}): MetaDescriptor[] {
  return blogMeta(post.seoTitle, post.description, post.coverImage, post.coverAlt, {
    ...context,
    pathname: context.pathname ?? `/blog/${post.slug}`,
  }, "article", post.publishedAt, post.socialImage);
}

export function blogIndexStructuredData(posts: readonly BlogPost[], appUrl?: string) {
  const origin = getCanonicalSiteOrigin(appUrl);
  const blogUrl = `${origin}/blog`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${blogUrl}#blog`,
        name: "EdiCut Blog",
        description: BLOG_DESCRIPTION,
        url: blogUrl,
        publisher: createSiteStructuredData(appUrl)["@graph"][0],
        blogPost: posts.map(post => ({ "@id": `${origin}/blog/${post.slug}#article` })),
        inLanguage: "en",
      },
      {
        "@type": "ItemList",
        "@id": `${blogUrl}#articles`,
        name: "Articles for YouTube creators",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "BlogPosting",
            "@id": `${origin}/blog/${post.slug}#article`,
            headline: post.title,
            url: `${origin}/blog/${post.slug}`,
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
        ],
      },
    ],
  };
}

export function blogPostStructuredData(post: BlogPost, appUrl?: string) {
  const origin = getCanonicalSiteOrigin(appUrl);
  const articleUrl = `${origin}/blog/${post.slug}`;
  const imageUrl = `${origin}${post.coverImage}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${articleUrl}#article`,
        headline: post.title,
        name: post.title,
        description: post.description,
        image: [imageUrl],
        url: articleUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
        datePublished: post.publishedAt,
        author: {
          "@type": "Organization",
          "@id": `${origin}/blog#editorial-team`,
          name: post.author,
          url: `${origin}/blog`,
        },
        publisher: createSiteStructuredData(appUrl)["@graph"][0],
        isPartOf: { "@type": "Blog", "@id": `${origin}/blog#blog`, name: "EdiCut Blog", url: `${origin}/blog` },
        inLanguage: "en",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: articleUrl },
        ],
      },
    ],
  };
}

export { serializeJsonLd };

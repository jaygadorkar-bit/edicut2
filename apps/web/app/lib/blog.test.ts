import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./blog";
import { blogIndexStructuredData, blogPostMeta, blogPostStructuredData } from "./blog-seo";
import { PUBLIC_PAGE_PATHS } from "./public-pages";
import { hireEdicutStoryContent } from "../components/site/hire-edicut-story-content";

const hireEdicutSlug = "3-reasons-why-you-should-hire-edicut";
const hireEdicutPost = BLOG_POSTS.find((post) => post.slug === hireEdicutSlug)!;
const publicDirectory = fileURLToPath(new URL("../../public", import.meta.url));

describe("blog artwork", () => {
  it("keeps article identifiers unique and editorial links on registered public pages", () => {
    expect(new Set(BLOG_POSTS.map(post => post.slug)).size).toBe(BLOG_POSTS.length);
    for (const post of BLOG_POSTS) {
      const sectionIds = post.sections.map(section => section.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
      expect(sectionIds).not.toContain("questions");
      const copy = [...post.intro, ...post.sections.flatMap(section => [
        ...section.paragraphs, ...(section.bullets ?? []),
      ]), ...post.faqs.map(faq => faq.answer), post.takeaway].join(" ");
      for (const match of copy.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)) {
        expect(PUBLIC_PAGE_PATHS).toContain(match[1].split("#")[0]);
      }
      if (post.serviceLink) expect(PUBLIC_PAGE_PATHS).toContain(post.serviceLink.to);
      const descriptors = blogPostMeta(post, {
        appUrl: "https://edicut.com", pathname: `/blog/${post.slug}`,
      }) as Array<Record<string, unknown>>;
      expect(descriptors.find(item => item.rel === "canonical")?.href).toBe(`https://edicut.com/blog/${post.slug}`);
      expect(descriptors.find(item => item.property === "og:image")?.content).toBe(`https://edicut.com${post.socialImage}`);
    }
  });

  it("uses responsive WebP covers for every article and a raster social fallback", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    for (const post of BLOG_POSTS) {
      expect(PUBLIC_PAGE_PATHS).toContain(`/blog/${post.slug}`);
      expect(post.coverImage).toMatch(/-1280\.webp$/);
      expect(post.socialImage).toMatch(/\.webp$/);
      for (const width of [640, 1280]) {
        const image = readFileSync(join(publicDirectory, post.coverImage.replace("-1280.webp", `-${width}.webp`).slice(1)));
        expect(image.toString("ascii", 0, 4)).toBe("RIFF");
        expect(image.toString("ascii", 8, 12)).toBe("WEBP");
      }
      expect(readFileSync(join(publicDirectory, post.socialImage.slice(1))).byteLength).toBeGreaterThan(0);
    }
  });

  it("keeps social cards on WebP while article metadata points to its high-resolution WebP cover", () => {
    const post = BLOG_POSTS[0];
    const descriptors = blogPostMeta(post, { appUrl: "https://edicut.com", pathname: `/blog/${post.slug}` }) as Array<Record<string, unknown>>;
    const ogImage = descriptors.find((item) => item.property === "og:image");
    const ogType = descriptors.find((item) => item.property === "og:image:type");
    expect(ogImage?.content).toBe(`https://edicut.com${post.socialImage}`);
    expect(ogType?.content).toBe("image/webp");
    expect(blogPostStructuredData(post, "https://edicut.com")["@graph"][0].image).toEqual([`https://edicut.com${post.coverImage}`]);
  });

  it("registers the EdiCut story for discovery with the custom outline and core links", () => {
    expect(hireEdicutPost).toBeDefined();
    expect(PUBLIC_PAGE_PATHS).toContain(`/blog/${hireEdicutSlug}`);
    expect(hireEdicutPost.sections.map(({ id, title }) => ({ id, title }))).toEqual(
      hireEdicutStoryContent.sections.map(({ id, title }) => ({ id, title })),
    );

    const articleLinks = [
      ...hireEdicutPost.intro,
      ...hireEdicutPost.sections.flatMap((section) => section.paragraphs),
    ].flatMap((copy) => [...copy.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)].map((match) => match[1]));
    expect(articleLinks).toContain("/services/youtube-video-editing");
    expect(articleLinks).toContain(hireEdicutStoryContent.sections[2].link.to);
  });

  it("uses a self-canonical article URL and the social fallback in page metadata", () => {
    const descriptors = blogPostMeta(hireEdicutPost, {
      appUrl: "https://edicut.com",
      pathname: `/blog/${hireEdicutSlug}`,
    }) as Array<Record<string, unknown>>;
    const canonical = descriptors.find((item) => item.tagName === "link" && item.rel === "canonical");
    const robots = descriptors.find((item) => item.name === "robots");
    const ogType = descriptors.find((item) => item.property === "og:type");
    const ogImage = descriptors.find((item) => item.property === "og:image");
    const ogImageType = descriptors.find((item) => item.property === "og:image:type");
    const ogAlt = descriptors.find((item) => item.property === "og:image:alt");
    const twitterImage = descriptors.find((item) => item.name === "twitter:image");

    expect(canonical?.href).toBe(`https://edicut.com/blog/${hireEdicutSlug}`);
    expect(robots?.content).toBe("index, follow");
    expect(ogType?.content).toBe("article");
    expect(ogImage?.content).toBe(`https://edicut.com${hireEdicutPost.socialImage}`);
    expect(ogImageType?.content).toBe("image/webp");
    expect(ogAlt?.content).toBe(hireEdicutPost.coverAlt);
    expect(twitterImage?.content).toBe(`https://edicut.com${hireEdicutPost.socialImage}`);
  });

  it("emits BlogPosting and article breadcrumbs, and indexes the article without film schema", () => {
    const origin = "https://edicut.com";
    const articleUrl = `${origin}/blog/${hireEdicutSlug}`;
    const articleGraph = blogPostStructuredData(hireEdicutPost, origin)["@graph"] as Array<Record<string, unknown>>;
    const posting = articleGraph.find((item) => item["@type"] === "BlogPosting");
    const breadcrumb = articleGraph.find((item) => item["@type"] === "BreadcrumbList");
    const postingData = posting as {
      url?: string;
      headline?: string;
      mainEntityOfPage?: { "@id"?: string };
    } | undefined;
    const breadcrumbData = breadcrumb as { itemListElement?: Array<{ name?: string }> } | undefined;
    const indexGraph = blogIndexStructuredData(BLOG_POSTS, origin)["@graph"] as Array<Record<string, unknown>>;
    const itemList = indexGraph.find((item) => item["@type"] === "ItemList") as {
      itemListElement?: Array<{ item?: { url?: string } }>;
    } | undefined;

    expect(postingData?.url).toBe(articleUrl);
    expect(postingData?.headline).toBe(hireEdicutPost.title);
    expect(postingData?.mainEntityOfPage?.["@id"]).toBe(articleUrl);
    expect(breadcrumbData?.itemListElement?.map((item) => item.name)).toEqual([
      "Home",
      "Blog",
      hireEdicutPost.title,
    ]);
    expect(itemList?.itemListElement?.some((item) => item.item?.url === articleUrl)).toBe(true);
    expect(indexGraph.some((item) => item["@type"] === "VideoObject")).toBe(false);
  });
});

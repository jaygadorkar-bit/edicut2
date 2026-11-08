import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDirectory = resolve(appDirectory, "build/client");
const expectedOrigin = "https://edicut.com";
const configuredOrigin = process.env.EDICUT_SEO_BUILD_ORIGIN;
const requiredPublicPaths = [
  "/",
  "/why-hire-us",
  "/services",
  "/services/gaming-video-editing",
  "/services/podcast-video-editing",
  "/services/short-form-video-editing",
  "/services/youtube-thumbnail-design",
  "/services/youtube-video-editing",
  "/pricing",
  "/portfolio",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/blog",
  "/blog/how-to-choose-youtube-video-editing-service",
  "/blog/youtube-video-editing-brief-checklist",
  "/blog/repurpose-youtube-videos-into-shorts",
  "/blog/3-reasons-why-you-should-hire-edicut",
  "/blog/youtube-audience-retention-editing-checklist",
  "/blog/video-podcast-editing-checklist",
];

if (configuredOrigin !== expectedOrigin || process.env.APP_URL !== expectedOrigin) {
  throw new Error(`Production SEO validation requires APP_URL=${expectedOrigin}.`);
}

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(entryPath);
    return entry.isFile() && entry.name.toLowerCase() === "index.html" ? [entryPath] : [];
  }));
  return files.flat();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? ""]));
}

function routeForFile(filePath) {
  const relativePath = relative(clientDirectory, filePath);
  const routeSegments = relativePath.split(sep).slice(0, -1);
  return routeSegments.length ? `/${routeSegments.join("/")}` : "/";
}

const htmlFiles = await findHtmlFiles(clientDirectory).catch((error) => {
  if (error?.code === "ENOENT") throw new Error("Production client build is missing; run the Cloudflare build first.");
  throw error;
});
const htmlByRoute = new Map();
const metadataByRoute = new Map();
const errors = [];

for (const filePath of htmlFiles) {
  const route = routeForFile(filePath);
  const html = await readFile(filePath, "utf8");
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const robots = tags.map(attributes).filter((attrs) => attrs.name?.toLowerCase() === "robots");
  const canonicals = (html.match(/<link\b[^>]*>/gi) ?? [])
    .map(attributes)
    .filter((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  const expectedCanonical = new URL(route, `${expectedOrigin}/`).toString();
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description = tags.map(attributes).find((attrs) => attrs.name?.toLowerCase() === "description")?.content?.trim() ?? "";

  htmlByRoute.set(route, filePath);
  metadataByRoute.set(route, { title, description });
  if (robots.length !== 1 || robots[0].content?.toLowerCase() !== "index, follow") {
    errors.push(`${route}: expected one indexable robots meta tag`);
  }
  if (canonicals.length !== 1 || canonicals[0].href !== expectedCanonical) {
    errors.push(`${route}: expected one canonical URL (${expectedCanonical})`);
  }
  if (h1Count !== 1) errors.push(`${route}: expected one H1, found ${h1Count}`);
  if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(html)) {
    errors.push(`${route}: contains a local development origin`);
  }
  if (!title) errors.push(`${route}: missing a title`);
  if (!description) errors.push(`${route}: missing a meta description`);
  if (route.startsWith("/pricing/") && /\b(video)\s+video\b/i.test(title)) {
    errors.push(`${route}: package title repeats “Video”`);
  }
}

for (const route of requiredPublicPaths) {
  if (!htmlByRoute.has(route)) errors.push(`${route}: required public page was not prerendered`);
}

const monthlyPackageDescriptions = [...metadataByRoute.entries()]
  .filter(([route, metadata]) => route.startsWith("/pricing/") && /monthly video editing package/i.test(metadata.title))
  .map(([, metadata]) => metadata.description);
if (monthlyPackageDescriptions.length > 1 && new Set(monthlyPackageDescriptions).size !== monthlyPackageDescriptions.length) {
  errors.push("/pricing/*: monthly package descriptions must reflect distinct capacity and staffing");
}

const home = htmlByRoute.has("/") ? await readFile(htmlByRoute.get("/"), "utf8") : "";
if (!home.includes('"@type":"Organization"') || !home.includes('"@type":"WebSite"')) {
  errors.push("/: expected indexable Organization and WebSite structured data");
}

if (errors.length) {
  process.stderr.write(`Prerendered SEO validation failed for ${errors.length} check(s):\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Prerendered SEO validation passed for ${htmlFiles.length} public pages.\n`);

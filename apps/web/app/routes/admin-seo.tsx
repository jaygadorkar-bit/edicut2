import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useActionData, useLoaderData, useNavigation } from "react-router";
import { SeoManagerPanel, type SeoHealthFinding, type SeoInternalLinkSuggestion, type SeoPageRecord, type SeoRedirectRecord, type SeoManagerFeedback } from "../components/admin/SeoManagerPanel";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { requireAdminUser, getAdminSession, commitAdminSession } from "../lib/session.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { DEFAULT_PUBLIC_SITE_ORIGIN, DEFAULT_SEO_DESCRIPTION, DEFAULT_SEO_TITLE, SOCIAL_PREVIEW_IMAGE_PATH, applySeoTitleTemplate, getCanonicalUrl, shouldIndexPage } from "../lib/seo";
import { PUBLIC_PAGE_PATHS } from "../lib/public-pages";
import { SERVICE_PAGES } from "../lib/services";
import { BLOG_POSTS } from "../lib/blog";
import { getPricingPackages, publicPricingPackages, configuredEditingPackage } from "../lib/pricing.server";
import { formatPackagePrice, SHORT_FORM_PACKAGE_SLUG, type EditingPackage } from "../lib/subscriptions";
import { resolveWebEnv } from "../lib/context.server";
import { getSiteSettingsSnapshot, saveSearchCrawlingEnabled } from "../lib/site-settings.server";
import {
  deleteSeoPageOverride,
  deleteSeoRedirect,
  getSeoAdminSettings,
  saveSeoGlobalMetadata,
  saveSeoPageOverride,
  saveSeoRedirect,
  SeoSettingsValidationError,
  validatePublicPagePath,
  validateInternalRoutePath,
  type SeoPageOverride,
  type SeoRedirectStatus,
} from "../lib/seo-admin.server";
import { runSeoTechnicalAudit } from "../lib/seo-audit.server";

const MAX_SEO_ACTION_BYTES = 32 * 1024;
const CANONICAL_ORIGIN = new URL(DEFAULT_PUBLIC_SITE_ORIGIN).origin;

export const meta: MetaFunction = () => [
  { title: "SEO | EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const settingsDb = getSupabaseClient(context) ? null : db;
  const [seoSettings, siteSettings, pricingPackages, adminSession] = await Promise.all([
    getSeoAdminSettings(settingsDb, context),
    getSiteSettingsSnapshot(settingsDb, context),
    getPricingPackages(settingsDb, context),
    getAdminSession(request.headers.get("Cookie"), context),
  ]);
  const appUrl = resolveWebEnv(context).APP_URL;
  const pageDefaults = getPageDefaults(publicPricingPackages(pricingPackages));
  const pages = pageDefaults.map((page): SeoPageRecord => {
    const saved = seoSettings.pageOverrides.find((item) => item.path === page.path);
    const defaultTitle = applySeoTitleTemplate(page.title, seoSettings.globalMetadata.titleTemplate);
    const defaults = {
      title: defaultTitle,
      description: page.description || seoSettings.globalMetadata.defaultDescription || DEFAULT_SEO_DESCRIPTION,
      canonicalUrl: getCanonicalUrl(appUrl, page.path),
      indexable: shouldIndexPage({
        pathname: page.path,
        appUrl,
        crawlingEnabled: siteSettings.searchCrawlingEnabled,
        maintenanceModeEnabled: siteSettings.maintenanceModeEnabled,
      }),
      focusKeyword: page.focusKeyword,
      socialTitle: defaultTitle,
      socialDescription: page.description || seoSettings.globalMetadata.defaultDescription || DEFAULT_SEO_DESCRIPTION,
      socialImageUrl: page.socialImageUrl || `${CANONICAL_ORIGIN}${SOCIAL_PREVIEW_IMAGE_PATH}`,
    };
    const overrides = saved ? mapPageOverrideToRecord(saved) : {};
    return {
      id: page.path,
      path: page.path,
      label: page.label,
      defaults,
      overrides,
    };
  });
  const redirects: SeoRedirectRecord[] = seoSettings.redirects.map((item) => ({
    id: item.from,
    sourcePath: item.from,
    destinationUrl: `${CANONICAL_ORIGIN}${item.to}`,
    statusCode: item.status,
    enabled: item.enabled,
  }));

  return data({
    adminUser: toPublicAdminUser(adminUser),
    pages,
    redirects,
    searchConsole: { status: "not-connected" as const, propertyUrl: "sc-domain:edicut.com" },
    notFoundPaths: [],
    globalSettings: {
      ...seoSettings.globalMetadata,
      allowIndexing: siteSettings.searchCrawlingEnabled,
    },
  }, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const form = await readMutationForm(request, MAX_SEO_ACTION_BYTES);
  if (!form) return { feedback: errorFeedback("The request could not be read or exceeds the SEO settings limit.") };

  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  if (!admin.active || admin.role !== "admin") return { feedback: errorFeedback("Admin access is required to change SEO settings.") };
  const settingsDb = getSupabaseClient(context) ? null : db;
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "run-audit") {
      const audit = await runSeoTechnicalAudit({ maxPages: 40, concurrency: 8, timeoutMs: 3_000 });
      const findings: SeoHealthFinding[] = audit.issues.slice(0, 400).map((issue) => ({
        id: issue.id,
        severity: issue.severity === "info" ? "notice" : issue.severity,
        title: issue.code.replaceAll("_", " "),
        detail: issue.message,
        pagePath: issue.path,
        recommendation: issue.recommendation,
      }));
      const internalLinkSuggestions: SeoInternalLinkSuggestion[] = audit.suggestions.slice(0, 100).map((item) => ({
        id: `${item.sourcePath}::${item.targetPath}`,
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        anchorText: item.anchorText,
        reason: item.reason,
      }));
      return {
        feedback: successFeedback(`Scanned ${audit.pages.length} of ${audit.limits.requestedPageCount} public pages.`),
        findings,
        internalLinkSuggestions,
        lastAuditAt: audit.auditedAt,
      };
    }

    if (intent === "save-global-settings") {
      const titleTemplate = readField(form, "titleTemplate", 100);
      const defaultDescription = readField(form, "defaultDescription", 320);
      await saveSeoGlobalMetadata(settingsDb, { titleTemplate, defaultDescription }, context);
      await saveSearchCrawlingEnabled(settingsDb, form.get("allowIndexing") === "on", context);
      return { feedback: successFeedback("Site-wide SEO defaults saved.") };
    }

    if (intent === "save-page-metadata") {
      const path = validatePublicPagePath(readField(form, "pageId", 512));
      const override: SeoPageOverride = {
        path,
        title: readField(form, "title", 70),
        description: readField(form, "description", 320),
        canonicalPath: canonicalUrlToPath(readField(form, "canonicalUrl", 2048)),
        indexable: form.get("indexable") === "on",
        focusKeyword: readField(form, "focusKeyword", 100),
        socialTitle: readField(form, "socialTitle", 70),
        socialDescription: readField(form, "socialDescription", 200),
        socialImageUrl: readField(form, "socialImageUrl", 2048),
      };
      await saveSeoPageOverride(settingsDb, override, context);
      return { feedback: successFeedback(`Metadata for ${path} saved.`) };
    }

    if (intent === "delete-page-metadata") {
      const path = validatePublicPagePath(readField(form, "pageId", 512));
      await deleteSeoPageOverride(settingsDb, path, context);
      return { feedback: successFeedback(`Metadata overrides for ${path} reset to page defaults.`) };
    }

    if (intent === "create-redirect") {
      const from = readField(form, "sourcePath", 512);
      const to = canonicalUrlToPath(readField(form, "destinationUrl", 2048), true, true);
      if (!to) throw new SeoSettingsValidationError("Enter a destination path on edicut.com.");
      const status = parseRedirectStatus(readField(form, "statusCode", 3));
      await saveSeoRedirect(settingsDb, { from, to, status, enabled: true }, context);
      return { feedback: successFeedback(`Redirect from ${from} added.`) };
    }

    if (intent === "update-redirect") {
      const from = readField(form, "redirectId", 512);
      const current = (await getSeoAdminSettings(settingsDb, context)).redirects.find((item) => item.from === from);
      if (!current) return { feedback: errorFeedback("That redirect no longer exists. Refresh and try again.") };
      const enabled = form.get("enabled") === "on";
      await saveSeoRedirect(settingsDb, { ...current, enabled }, context);
      return { feedback: successFeedback(`Redirect from ${from} ${enabled ? "enabled" : "paused"}.`) };
    }

    if (intent === "delete-redirect") {
      const from = readField(form, "redirectId", 512);
      await deleteSeoRedirect(settingsDb, from, context);
      return { feedback: successFeedback(`Redirect from ${from} deleted.`) };
    }

    return { feedback: errorFeedback("Choose a supported SEO action.") };
  } catch (error) {
    if (error instanceof SeoSettingsValidationError) return { feedback: errorFeedback(error.message) };
    console.error("SEO admin action failed.", error);
    return { feedback: errorFeedback("The SEO change could not be saved. Check the database connection and try again.") };
  }
}

function mapPageOverrideToRecord(override: SeoPageOverride): SeoPageRecord["overrides"] {
  return {
    ...(override.title !== undefined ? { title: override.title } : {}),
    ...(override.description !== undefined ? { description: override.description } : {}),
    ...(override.canonicalPath !== undefined ? { canonicalUrl: getCanonicalUrl(DEFAULT_PUBLIC_SITE_ORIGIN, override.canonicalPath) } : {}),
    ...(override.indexable !== undefined ? { indexable: override.indexable } : {}),
    ...(override.focusKeyword !== undefined ? { focusKeyword: override.focusKeyword } : {}),
    ...(override.socialTitle !== undefined ? { socialTitle: override.socialTitle } : {}),
    ...(override.socialDescription !== undefined ? { socialDescription: override.socialDescription } : {}),
    ...(override.socialImageUrl !== undefined ? { socialImageUrl: normalizeSocialImageUrl(override.socialImageUrl) } : {}),
  };
}

function normalizeSocialImageUrl(value: string) {
  try { return new URL(value, DEFAULT_PUBLIC_SITE_ORIGIN).toString(); }
  catch { return value; }
}

function canonicalUrlToPath(value: string, required = false, allowAnyLocalPath = false) {
  const raw = value.trim();
  if (!raw) {
    if (required) throw new SeoSettingsValidationError("Enter a destination path on edicut.com.");
    return undefined;
  }
  let url: URL;
  try { url = new URL(raw, `${CANONICAL_ORIGIN}/`); }
  catch { throw new SeoSettingsValidationError("Enter a valid edicut.com URL or local path."); }
  const isEdiCutHost = url.hostname.toLowerCase() === "edicut.com" || url.hostname.toLowerCase() === "www.edicut.com";
  if (url.protocol !== "https:" || !isEdiCutHost || url.port || url.search || url.hash || url.username || url.password) {
    throw new SeoSettingsValidationError("Use a clean HTTPS URL on edicut.com with no query or fragment.");
  }
  return allowAnyLocalPath
    ? validateInternalRoutePath(url.pathname, "Destination path")
    : validatePublicPagePath(url.pathname, "Canonical path");
}

function parseRedirectStatus(value: string): SeoRedirectStatus {
  if (value === "301" || value === "302" || value === "307" || value === "308") return Number(value) as SeoRedirectStatus;
  throw new SeoSettingsValidationError("Choose a supported redirect status.");
}

function readField(form: FormData, key: string, maxLength: number) {
  const value = form.get(key);
  if (typeof value !== "string") throw new SeoSettingsValidationError(`Enter a valid ${key} value.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new SeoSettingsValidationError(`${key} must be ${maxLength} characters or fewer.`);
  return trimmed;
}

function errorFeedback(message: string): SeoManagerFeedback {
  return { kind: "error", message };
}

function successFeedback(message: string): SeoManagerFeedback {
  return { kind: "success", message };
}

function getPageDefaults(pricingPackages: ReturnType<typeof publicPricingPackages>) {
  const pages: Array<{ path: string; label: string; title: string; description: string; focusKeyword?: string; socialTitle?: string; socialDescription?: string; socialImageUrl?: string }> = [];
  const byPath = new Map<string, typeof pages[number]>();
  const add = (page: typeof pages[number]) => { byPath.set(page.path, page); };
  const blogPostsByPath = new Map(BLOG_POSTS.map((post) => [`/blog/${post.slug}`, post]));
  const servicesByPath = new Map(SERVICE_PAGES.map((service) => [`/services/${service.slug}`, service]));

  for (const path of PUBLIC_PAGE_PATHS) {
    const service = servicesByPath.get(path);
    const post = blogPostsByPath.get(path);
    if (service) {
      add({ path, label: service.title, title: service.metaTitle, description: service.description, focusKeyword: service.title.toLocaleLowerCase() });
    } else if (post) {
      add({ path, label: post.title, title: post.seoTitle, description: post.description, focusKeyword: post.primaryKeyword, socialTitle: post.seoTitle, socialImageUrl: post.socialImage });
    } else if (path === "/") {
      add({ path, label: "Home", title: DEFAULT_SEO_TITLE, description: DEFAULT_SEO_DESCRIPTION, focusKeyword: "video editing for YouTube creators" });
    } else if (path === "/why-hire-us") {
      add({ path, label: "Why hire EdiCut", title: "Why Hire EdiCut: Studio Reliability vs. Freelancer Risk | YouTube Video Editing", description: "Meet your dedicated editor and project manager, get studio-reviewed edits, and manage projects, feedback, and downloads in one EdiCut dashboard." });
    } else if (path === "/services") {
      add({ path, label: "Services", title: "Video Editing & YouTube Thumbnail Services | EdiCut", description: "Explore EdiCut services for YouTube videos, podcasts, Shorts, Reels, gaming, and thumbnails. Find the right editing approach for your next upload." });
    } else if (path === "/pricing") {
      add({ path, label: "Pricing", title: "Video Editing Prices: Single Videos and Monthly Packages | EdiCut", description: "Choose a single video edit or a monthly package from EdiCut. Compare clear scope, editing capacity, delivery targets, and prices." });
    } else if (path === "/portfolio") {
      add({ path, label: "Portfolio", title: "Video Editing Portfolio and Style References | EdiCut", description: "Explore video editing styles for YouTube, podcasts, gaming, and more. Browse EdiCut's gallery with credited reference examples and editing package options." });
    } else if (path === "/faq") {
      add({ path, label: "FAQs", title: "YouTube Video Editing FAQs: Pricing, Process, and Delivery | EdiCut", description: "Answers about EdiCut video editing plans, project setup, footage handoff, revisions, turnaround, thumbnails, and account security." });
    } else if (path === "/contact") {
      add({ path, label: "Contact", title: "Contact EdiCut | Video Editing for YouTube Creators", description: "Tell EdiCut about your YouTube, podcast, or short-form video project and get matched with an editing plan for your workflow." });
    } else if (path === "/privacy") {
      add({ path, label: "Privacy policy", title: "Privacy Policy | EdiCut", description: "Read how EdiCut handles account details, creator project data, source-footage links, billing information, and confidential materials." });
    } else if (path === "/terms") {
      add({ path, label: "Terms of service", title: "Terms of Service | EdiCut", description: "Review EdiCut service scope, video editing plans, estimates, project billing, revisions, and cancellation terms." });
    } else if (path === "/blog") {
      add({ path, label: "Blog", title: "Video Editing Guides & Studio Insights | EdiCut Blog", description: "Explore EdiCut’s video editing guides and studio insights: choose an editing partner, plan your brief, repurpose videos, and understand our service.", socialImageUrl: "/images/blog/choose-editing-partner.webp" });
    } else {
      const label = path.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? path;
      add({ path, label, title: `${label.replace(/\b\w/g, (letter) => letter.toUpperCase())} | EdiCut`, description: DEFAULT_SEO_DESCRIPTION });
    }
  }

  for (const record of pricingPackages) {
    const editingPackage = configuredEditingPackage(record.slug, pricingPackages);
    if (!editingPackage) continue;
    add({
      path: `/pricing/${editingPackage.slug}`,
      label: `${editingPackage.name} package`,
      title: editingPackage.slug === SHORT_FORM_PACKAGE_SLUG
        ? "Short-Form Video Editing | Reels, TikTok & Shorts | EdiCut"
        : `${editingPackage.name} ${editingPackage.packageType === "monthly" ? "Monthly Video Editing Package" : "Editing Package"} | EdiCut`,
      description: getPackageSeoDescription(editingPackage),
      focusKeyword: `${editingPackage.name.toLocaleLowerCase()} video editing package`,
    });
  }

  for (const path of PUBLIC_PAGE_PATHS) {
    if (!byPath.has(path)) {
      const label = path.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Home";
      add({ path, label, title: `${label.replace(/\b\w/g, (letter) => letter.toUpperCase())} | EdiCut`, description: DEFAULT_SEO_DESCRIPTION });
    }
  }

  return [...byPath.values()];
}

function getPackageSeoDescription(editingPackage: EditingPackage) {
  if (editingPackage.slug === SHORT_FORM_PACKAGE_SLUG) {
    return `Order a ${formatPackagePrice(editingPackage.basePrice)} short-form video edit for TikTok, Instagram Reels, or YouTube Shorts. One vertical, captioned edit up to 60 seconds, with one revision included.`;
  }
  if (editingPackage.packageType === "monthly") {
    const hasSharedEditorStaffing = editingPackage.features.some((feature) => /\btwo\b.*\beditors?\b/i.test(feature));
    const editorCapacity = hasSharedEditorStaffing ? "shared by two dedicated video editors" : "supported by a dedicated video editor";
    return `${editingPackage.editingHoursPerMonth} editing hours per month at ${editingPackage.editingHoursPerWorkday} hours per workday across ${editingPackage.workingDaysPerMonth} working days, ${editorCapacity}. ${editingPackage.bestFor}`;
  }
  return `${editingPackage.videoFormat}, ${editingPackage.finishedLength.toLowerCase()} finished from ${editingPackage.rawFootageLimit.toLowerCase()} of footage, with ${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "revision" : "revisions"}. See the current scope and price.`;
}

export default function AdminSeoRoute() {
  const { adminUser, pages, redirects, searchConsole, notFoundPaths, globalSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <AdminPanelShell title="SEO" activeTab="seo" account={{ name: adminUser.name || "Admin", detail: adminUser.email }}>
      <SeoManagerPanel
        pages={pages}
        findings={actionData?.findings ?? []}
        redirects={redirects}
        notFoundPaths={notFoundPaths}
        searchConsole={searchConsole}
        internalLinkSuggestions={actionData?.internalLinkSuggestions ?? []}
        globalSettings={globalSettings}
        lastAuditAt={actionData?.lastAuditAt}
        feedback={actionData?.feedback}
        isSubmitting={navigation.state !== "idle"}
      />
    </AdminPanelShell>
  );
}

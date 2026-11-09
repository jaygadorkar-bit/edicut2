import type { DatabaseClient } from "@edicut/db/client";
import type { SupabaseRuntimeContext } from "../integrations/supabase/client.server";
import { PUBLIC_PAGE_PATHS } from "./public-pages";
import { DEFAULT_SEO_DESCRIPTION } from "./seo";
import { getSiteSettings, saveSiteSetting } from "./site-settings.server";

const SEO_GLOBAL_METADATA_KEY = "seo_global_metadata_v1";
const SEO_PAGE_OVERRIDES_KEY = "seo_page_overrides_v1";
const SEO_REDIRECTS_KEY = "seo_redirects_v1";
const MAX_PAGE_OVERRIDES = 300;
const MAX_REDIRECTS = 500;
const MAX_GLOBAL_METADATA_BYTES = 1024;
const MAX_PAGE_SETTINGS_BYTES = 48 * 1024;
const MAX_REDIRECT_SETTINGS_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 70;
const MAX_DESCRIPTION_LENGTH = 320;
const MAX_SOCIAL_TITLE_LENGTH = 70;
const MAX_SOCIAL_DESCRIPTION_LENGTH = 200;
const MAX_FOCUS_KEYWORD_LENGTH = 100;
const MAX_TITLE_TEMPLATE_LENGTH = 100;
const CANONICAL_ORIGIN = "https://edicut.com";
const DEFAULT_TITLE_TEMPLATE = "%s | EdiCut";

const publicPagePaths = new Set(PUBLIC_PAGE_PATHS.map(normalizeStoredPath));

export type SeoPageOverride = {
  path: string;
  title?: string;
  description?: string;
  canonicalPath?: string;
  socialImageUrl?: string;
  socialTitle?: string;
  socialDescription?: string;
  focusKeyword?: string;
  indexable?: boolean;
};

export type SeoGlobalMetadata = {
  titleTemplate: string;
  defaultDescription: string;
};

export type SeoRedirectStatus = 301 | 302 | 307 | 308;

export type SeoRedirect = {
  from: string;
  to: string;
  status: SeoRedirectStatus;
  enabled: boolean;
};

export type SeoAdminSettings = {
  globalMetadata: SeoGlobalMetadata;
  pageOverrides: SeoPageOverride[];
  redirects: SeoRedirect[];
};

export class SeoSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeoSettingsValidationError";
  }
}

/**
 * Read the two bounded SEO collections from the existing site_settings store.
 * A failed database read is surfaced so an admin save cannot silently replace
 * settings with an empty collection.
 */
export async function getSeoAdminSettings(
  db: DatabaseClient | null | undefined,
  context?: SupabaseRuntimeContext,
): Promise<SeoAdminSettings> {
  const values = await getSiteSettings(db, [SEO_GLOBAL_METADATA_KEY, SEO_PAGE_OVERRIDES_KEY, SEO_REDIRECTS_KEY], context, { failOnError: true });
  return {
    globalMetadata: parseGlobalMetadata(values[SEO_GLOBAL_METADATA_KEY]),
    pageOverrides: parsePageOverrides(values[SEO_PAGE_OVERRIDES_KEY]),
    redirects: parseRedirects(values[SEO_REDIRECTS_KEY]),
  };
}

export async function saveSeoGlobalMetadata(
  db: DatabaseClient | null | undefined,
  input: SeoGlobalMetadata,
  context?: SupabaseRuntimeContext,
) {
  const metadata = validateSeoGlobalMetadata(input);
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_GLOBAL_METADATA_BYTES) {
    throw new SeoSettingsValidationError("Global SEO metadata exceeds the storage limit.");
  }
  await saveSiteSetting(db, SEO_GLOBAL_METADATA_KEY, serialized, context);
  return metadata;
}

export async function saveSeoPageOverride(
  db: DatabaseClient | null | undefined,
  input: SeoPageOverride,
  context?: SupabaseRuntimeContext,
) {
  const override = validateSeoPageOverride(input);
  const current = await getSeoAdminSettings(db, context);
  const next = current.pageOverrides.filter((item) => item.path !== override.path);
  next.push(override);
  next.sort((left, right) => left.path.localeCompare(right.path));
  await persistCollection(db, SEO_PAGE_OVERRIDES_KEY, next, MAX_PAGE_OVERRIDES, MAX_PAGE_SETTINGS_BYTES, context);
  return override;
}

export async function deleteSeoPageOverride(
  db: DatabaseClient | null | undefined,
  path: string,
  context?: SupabaseRuntimeContext,
) {
  const safePath = validatePublicPagePath(path, "Page path");
  const current = await getSeoAdminSettings(db, context);
  const next = current.pageOverrides.filter((item) => item.path !== safePath);
  await persistCollection(db, SEO_PAGE_OVERRIDES_KEY, next, MAX_PAGE_OVERRIDES, MAX_PAGE_SETTINGS_BYTES, context);
}

export async function saveSeoRedirect(
  db: DatabaseClient | null | undefined,
  input: SeoRedirect,
  context?: SupabaseRuntimeContext,
) {
  const redirect = validateSeoRedirect(input);
  if (redirect.from === redirect.to) throw new SeoSettingsValidationError("A redirect must point to a different path.");

  const current = await getSeoAdminSettings(db, context);
  const next = current.redirects.filter((item) => item.from !== redirect.from);
  next.push(redirect);
  next.sort((left, right) => left.from.localeCompare(right.from));
  assertNoRedirectCycles(next);
  await persistCollection(db, SEO_REDIRECTS_KEY, next, MAX_REDIRECTS, MAX_REDIRECT_SETTINGS_BYTES, context);
  return redirect;
}

export async function deleteSeoRedirect(
  db: DatabaseClient | null | undefined,
  from: string,
  context?: SupabaseRuntimeContext,
) {
  const safeFrom = validateInternalRoutePath(from, "Source path");
  const current = await getSeoAdminSettings(db, context);
  const next = current.redirects.filter((item) => item.from !== safeFrom);
  await persistCollection(db, SEO_REDIRECTS_KEY, next, MAX_REDIRECTS, MAX_REDIRECT_SETTINGS_BYTES, context);
}

export async function getSeoRedirectForPath(
  db: DatabaseClient | null | undefined,
  pathname: string,
  context?: SupabaseRuntimeContext,
) {
  const safePath = validateInternalRoutePath(pathname, "Request path");
  const { redirects } = await getSeoAdminSettings(db, context);
  return redirects.find((redirect) => redirect.enabled && redirect.from === safePath);
}

export function findSeoPageOverride(overrides: readonly SeoPageOverride[], pathname: string) {
  const path = validatePublicPagePath(pathname, "Page path");
  return overrides.find((override) => override.path === path);
}

export function validateSeoPageOverride(input: SeoPageOverride): SeoPageOverride {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SeoSettingsValidationError("SEO page settings must be an object.");
  }

  const path = validatePublicPagePath(input.path, "Page path");
  const result: SeoPageOverride = { path };
  const title = cleanText(input.title, MAX_TITLE_LENGTH, "SEO title");
  const description = cleanText(input.description, MAX_DESCRIPTION_LENGTH, "Meta description");
  const socialTitle = cleanText(input.socialTitle, MAX_SOCIAL_TITLE_LENGTH, "Social title");
  const socialDescription = cleanText(input.socialDescription, MAX_SOCIAL_DESCRIPTION_LENGTH, "Social description");
  const focusKeyword = cleanText(input.focusKeyword, MAX_FOCUS_KEYWORD_LENGTH, "Focus keyword");
  const canonicalPath = input.canonicalPath === undefined || input.canonicalPath === ""
    ? undefined
    : validatePublicPagePath(input.canonicalPath, "Canonical path");
  const socialImageUrl = cleanSocialImageUrl(input.socialImageUrl);

  if (title) result.title = title;
  if (description) result.description = description;
  if (socialTitle) result.socialTitle = socialTitle;
  if (socialDescription) result.socialDescription = socialDescription;
  if (focusKeyword) result.focusKeyword = focusKeyword;
  if (canonicalPath) result.canonicalPath = canonicalPath;
  if (socialImageUrl) result.socialImageUrl = socialImageUrl;
  if (input.indexable !== undefined) {
    if (typeof input.indexable !== "boolean") throw new SeoSettingsValidationError("Indexing preference must be true or false.");
    result.indexable = input.indexable;
  }

  if (Object.keys(result).length === 1) {
    throw new SeoSettingsValidationError("Enter at least one SEO override before saving.");
  }
  return result;
}

export function validateSeoGlobalMetadata(input: SeoGlobalMetadata): SeoGlobalMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SeoSettingsValidationError("Global SEO metadata must be an object.");
  }
  const titleTemplate = cleanText(input.titleTemplate, MAX_TITLE_TEMPLATE_LENGTH, "Title template");
  const defaultDescription = cleanText(input.defaultDescription, MAX_DESCRIPTION_LENGTH, "Default description");
  if (!titleTemplate || !titleTemplate.includes("%s")) {
    throw new SeoSettingsValidationError("Title template must include the %s page-title placeholder.");
  }
  if (!defaultDescription) throw new SeoSettingsValidationError("Default description cannot be empty.");
  return { titleTemplate, defaultDescription };
}

export function validateSeoRedirect(input: SeoRedirect): SeoRedirect {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SeoSettingsValidationError("Redirect settings must be an object.");
  }

  const from = validateInternalRoutePath(input.from, "Source path");
  const to = validateInternalRoutePath(input.to, "Destination path");
  if (isAdminOrApiPath(from) || isAdminOrApiPath(to)) {
    throw new SeoSettingsValidationError("Admin and API routes cannot be redirected from the SEO manager.");
  }
  if (from === to) throw new SeoSettingsValidationError("A redirect must point to a different path.");

  const allowedStatuses: SeoRedirectStatus[] = [301, 302, 307, 308];
  if (!allowedStatuses.includes(input.status)) throw new SeoSettingsValidationError("Choose a supported redirect status.");
  if (typeof input.enabled !== "boolean") throw new SeoSettingsValidationError("Redirect status must be enabled or disabled.");
  return { from, to, status: input.status, enabled: input.enabled };
}

export function validatePublicPagePath(value: string, label = "Page path") {
  const path = validateInternalRoutePath(value, label);
  if (publicPagePaths.has(path) || /^\/pricing\/[a-z0-9-]{1,100}$/.test(path)) return path;
  throw new SeoSettingsValidationError(`${label} must match a published public page.`);
}

/** Normalize a safe same-site path without accepting URL authority, query, or hash parts. */
export function validateInternalRoutePath(value: string, label = "Path") {
  if (typeof value !== "string") throw new SeoSettingsValidationError(`${label} must be a path on this website.`);
  const candidate = value.trim();
  if (
    candidate.length === 0 || candidate.length > 512 ||
    !candidate.startsWith("/") || candidate.startsWith("//") ||
    /[\\?#\u0000-\u001f\u007f<>"`]/.test(candidate) ||
    /%(?:2f|5c|2e)/i.test(candidate) || candidate.includes("//")
  ) {
    throw new SeoSettingsValidationError(`${label} must be a clean, same-site path with no query or fragment.`);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    throw new SeoSettingsValidationError(`${label} contains invalid URL encoding.`);
  }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded)) {
    throw new SeoSettingsValidationError(`${label} contains unsafe characters.`);
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new SeoSettingsValidationError(`${label} cannot contain dot segments.`);
  }

  return normalizeStoredPath(candidate);
}

function cleanText(value: string | undefined, maxLength: number, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new SeoSettingsValidationError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new SeoSettingsValidationError(`${label} must be ${maxLength} characters or fewer.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
    throw new SeoSettingsValidationError(`${label} contains unsupported control characters.`);
  }
  return trimmed || undefined;
}

function cleanSocialImageUrl(value: string | undefined) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new SeoSettingsValidationError("Social image URL must be text.");
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2048 || /[\u0000-\u0020\u007f<>"`]/.test(trimmed)) {
    throw new SeoSettingsValidationError("Social image URL is too long or contains invalid characters.");
  }

  let url: URL;
  try {
    url = new URL(trimmed, CANONICAL_ORIGIN);
  } catch {
    throw new SeoSettingsValidationError("Social image URL must be a valid HTTPS image path or URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new SeoSettingsValidationError("Social image URL must use HTTPS and cannot include credentials.");
  }
  if (url.origin !== CANONICAL_ORIGIN && !trimmed.startsWith("https://")) {
    throw new SeoSettingsValidationError("Social image URL must be a local image path or HTTPS URL.");
  }
  if (url.origin === CANONICAL_ORIGIN && trimmed.startsWith("/")) {
    const rawPath = trimmed.split(/[?#]/, 1)[0];
    validateInternalRoutePath(rawPath, "Social image path");
  }
  if (url.hash) throw new SeoSettingsValidationError("Social image URL cannot include a fragment.");
  return url.origin === CANONICAL_ORIGIN ? `${url.pathname}${url.search}` : url.toString();
}

function parsePageOverrides(value: string | undefined): SeoPageOverride[] {
  const parsed = parseJsonArray(value, MAX_PAGE_SETTINGS_BYTES);
  if (!parsed) return [];
  const valid: SeoPageOverride[] = [];
  for (const item of parsed.slice(0, MAX_PAGE_OVERRIDES)) {
    try {
      valid.push(validateSeoPageOverride(item as SeoPageOverride));
    } catch {
      // Ignore invalid legacy rows rather than breaking the admin tools.
    }
  }
  return dedupeBy(valid, (item) => item.path);
}

function parseGlobalMetadata(value: string | undefined): SeoGlobalMetadata {
  if (!value || value.length > MAX_GLOBAL_METADATA_BYTES) return getDefaultGlobalMetadata();
  try {
    const parsed: unknown = JSON.parse(value);
    return validateSeoGlobalMetadata(parsed as SeoGlobalMetadata);
  } catch {
    return getDefaultGlobalMetadata();
  }
}

function parseRedirects(value: string | undefined): SeoRedirect[] {
  const parsed = parseJsonArray(value, MAX_REDIRECT_SETTINGS_BYTES);
  if (!parsed) return [];
  const valid: SeoRedirect[] = [];
  for (const item of parsed.slice(0, MAX_REDIRECTS)) {
    try {
      const redirect = validateSeoRedirect(item as SeoRedirect);
      if (redirect.from !== redirect.to) valid.push(redirect);
    } catch {
      // Ignore malformed saved rows; route handling must not trust stored JSON.
    }
  }
  const deduped = dedupeBy(valid, (item) => item.from);
  try {
    assertNoRedirectCycles(deduped);
    return deduped;
  } catch {
    // Fail closed if a previous version or manual DB edit introduced a cycle.
    return [];
  }
}

function parseJsonArray(value: string | undefined, maxBytes: number): unknown[] | undefined {
  if (!value || value.length > maxBytes) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) map.set(keyOf(item), item);
  return [...map.values()];
}

function assertNoRedirectCycles(redirects: readonly SeoRedirect[]) {
  const destinations = new Map(redirects.filter((item) => item.enabled).map((item) => [item.from, item.to]));
  for (const start of destinations.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current && destinations.has(current)) {
      if (visited.has(current)) throw new SeoSettingsValidationError("These redirects would create a redirect loop.");
      visited.add(current);
      current = destinations.get(current);
    }
  }
}

function isAdminOrApiPath(path: string) {
  return path === "/api" || path.startsWith("/api/") || path === "/site/node-logmin" || path.startsWith("/site/node-logmin/");
}

async function persistCollection(
  db: DatabaseClient | null | undefined,
  key: string,
  values: SeoPageOverride[] | SeoRedirect[],
  maxItems: number,
  maxBytes: number,
  context?: SupabaseRuntimeContext,
) {
  if (values.length > maxItems) throw new SeoSettingsValidationError(`Only ${maxItems} settings can be saved in this section.`);
  const serialized = JSON.stringify(values);
  if (serialized.length > maxBytes) throw new SeoSettingsValidationError("These SEO settings exceed the storage limit.");
  await saveSiteSetting(db, key, serialized, context);
}

function normalizeStoredPath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

function getDefaultGlobalMetadata(): SeoGlobalMetadata {
  return { titleTemplate: DEFAULT_TITLE_TEMPLATE, defaultDescription: DEFAULT_SEO_DESCRIPTION };
}

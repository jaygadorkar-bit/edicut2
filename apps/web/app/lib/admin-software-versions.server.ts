import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { adminSoftwareVersions, type AdminSoftwareVersionEntry } from "./admin-software-versions";

const SUCCESS_CACHE_MS = 6 * 60 * 60 * 1000;
const PARTIAL_CACHE_MS = 5 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 5_000;
const NPM_REGISTRY_URL = "https://registry.npmjs.org";

export type AdminSoftwareVersionRow = Omit<AdminSoftwareVersionEntry, "lookup"> & {
  latestStatus: "automatic" | "saved-reference";
};

export type AdminSoftwareVersionSnapshot = {
  checkedAt: string;
  automaticCount: number;
  totalCount: number;
  versions: AdminSoftwareVersionRow[];
};

type CacheEntry = {
  expiresAt: number;
  snapshot: AdminSoftwareVersionSnapshot;
};

type NodeRelease = {
  version?: unknown;
  lts?: unknown;
};

type NpmLatestPackage = {
  version?: unknown;
};

let cacheEntry: CacheEntry | null = null;
let refreshInFlight: Promise<CacheEntry> | null = null;

function isStableVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

function isPostgresVersion(value: unknown): value is string {
  // PostgreSQL 10 and newer use a major.minor version, such as 18.6.
  return typeof value === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(value);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  }, SOURCE_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Version source returned ${response.status}.`);
  return await response.json() as T;
}

async function getNpmLatestVersion(packageName: string) {
  const encodedPackageName = encodeURIComponent(packageName);
  const latest = await fetchJson<NpmLatestPackage>(`${NPM_REGISTRY_URL}/${encodedPackageName}/latest`);
  if (!isStableVersion(latest.version)) throw new Error("Package registry returned an invalid stable version.");
  return latest.version;
}

async function getLatestNodeLtsVersion() {
  const releases = await fetchJson<NodeRelease[]>("https://nodejs.org/dist/index.json");
  const release = releases.find((candidate) => candidate.lts && isStableVersion(
    typeof candidate.version === "string" ? candidate.version.replace(/^v/, "") : candidate.version,
  ));
  if (!release || typeof release.version !== "string") throw new Error("Node.js release data did not include an LTS version.");
  return `${release.version.replace(/^v/, "")} LTS`;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function postgresMajorVersion(value: string) {
  const match = value.trim().match(/^v?(\d+)\./);
  const major = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(major) && major >= 10 ? major : null;
}

export function getLatestSupportedPostgresVersion(html: string, currentVersion: string) {
  const currentMajor = postgresMajorVersion(currentVersion);
  if (currentMajor === null) throw new Error("The installed PostgreSQL major version is unavailable.");

  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  let latestForCurrentMajor: string | null = null;

  for (const [, row] of rows) {
    const cells = Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), ([, cell]) => stripHtml(cell));
    const major = Number(cells[0]);
    const latestMinor = cells[1];
    const supported = cells[2]?.toLowerCase() === "yes";
    if (major !== currentMajor || !isPostgresVersion(latestMinor) || !supported) continue;
    latestForCurrentMajor = latestMinor;
  }

  if (!latestForCurrentMajor) throw new Error(`PostgreSQL ${currentMajor} release data is unavailable.`);
  return latestForCurrentMajor;
}

async function getLatestPostgresVersion(currentVersion: string) {
  const response = await fetchWithTimeout("https://www.postgresql.org/support/versioning/", {
    headers: { Accept: "text/html" },
    cache: "no-store",
  }, SOURCE_TIMEOUT_MS);
  if (!response.ok) throw new Error(`PostgreSQL version source returned ${response.status}.`);
  const html = await response.text();
  return getLatestSupportedPostgresVersion(html, currentVersion);
}

async function fetchLatestVersion(entry: AdminSoftwareVersionEntry) {
  switch (entry.lookup.kind) {
    case "npm":
      return await getNpmLatestVersion(entry.lookup.packageName);
    case "node-lts":
      return await getLatestNodeLtsVersion();
    case "postgres-latest-supported":
      return await getLatestPostgresVersion(entry.currentVersion);
  }
}

async function readCurrentPostgresVersion(db?: DatabaseClient) {
  if (!db) return null;

  try {
    const result = await db.execute(sql`SELECT current_setting('server_version') AS "postgresVersion"`);
    const rows = result as unknown as Array<{ postgresVersion?: unknown }>;
    const version = rows[0]?.postgresVersion;
    return typeof version === "string" && isPostgresVersion(version) ? version : null;
  } catch {
    return null;
  }
}

function withCurrentPostgresVersion(snapshot: AdminSoftwareVersionSnapshot, currentVersion: string | null) {
  return {
    ...snapshot,
    versions: snapshot.versions.map((version) => version.name === "PostgreSQL"
      ? { ...version, currentVersion: currentVersion ?? "unknown" }
      : version),
  };
}

function getPostgresVersion(snapshot: AdminSoftwareVersionSnapshot) {
  return snapshot.versions.find((version) => version.name === "PostgreSQL");
}

async function refreshVersions(currentPostgresVersion: string | null): Promise<CacheEntry> {
  const versions = await Promise.all(adminSoftwareVersions.map(async (entry): Promise<AdminSoftwareVersionRow> => {
    const currentVersion = entry.lookup.kind === "postgres-latest-supported"
      ? currentPostgresVersion ?? entry.currentVersion
      : entry.currentVersion;
    const versionEntry = currentVersion === entry.currentVersion ? entry : { ...entry, currentVersion };

    try {
      return {
        name: entry.name,
        category: entry.category,
        currentVersion,
        latestVersion: await fetchLatestVersion(versionEntry),
        sourceLabel: entry.sourceLabel,
        sourceUrl: entry.sourceUrl,
        latestStatus: "automatic",
      };
    } catch {
      return {
        name: entry.name,
        category: entry.category,
        currentVersion,
        latestVersion: entry.latestVersion,
        sourceLabel: entry.sourceLabel,
        sourceUrl: entry.sourceUrl,
        latestStatus: "saved-reference",
      };
    }
  }));

  const automaticCount = versions.filter((version) => version.latestStatus === "automatic").length;
  const snapshot: AdminSoftwareVersionSnapshot = {
    checkedAt: new Date().toISOString(),
    automaticCount,
    totalCount: versions.length,
    versions,
  };

  return {
    snapshot,
    expiresAt: Date.now() + (automaticCount === versions.length ? SUCCESS_CACHE_MS : PARTIAL_CACHE_MS),
  };
}

export async function getAdminSoftwareVersionSnapshot(db?: DatabaseClient): Promise<AdminSoftwareVersionSnapshot> {
  const currentPostgresVersion = await readCurrentPostgresVersion(db);
  const currentMajor = currentPostgresVersion ? postgresMajorVersion(currentPostgresVersion) : null;
  const cachedPostgresMajor = cacheEntry ? postgresMajorVersion(getPostgresVersion(cacheEntry.snapshot)?.latestVersion ?? "") : null;
  const cacheMatchesCurrentMajor = currentMajor === null || cachedPostgresMajor === currentMajor;

  if (cacheEntry && Date.now() < cacheEntry.expiresAt && cacheMatchesCurrentMajor) {
    return withCurrentPostgresVersion(cacheEntry.snapshot, currentPostgresVersion);
  }
  if (refreshInFlight) {
    const result = await refreshInFlight;
    return withCurrentPostgresVersion(result.snapshot, currentPostgresVersion);
  }

  const pendingRefresh = refreshVersions(currentPostgresVersion);
  refreshInFlight = pendingRefresh;
  try {
    cacheEntry = await pendingRefresh;
    return withCurrentPostgresVersion(cacheEntry.snapshot, currentPostgresVersion);
  } finally {
    if (refreshInFlight === pendingRefresh) refreshInFlight = null;
  }
}
